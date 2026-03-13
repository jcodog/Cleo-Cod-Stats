import type { WebhookEvent } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { httpRouter } from "convex/server";
import { Webhook } from "svix";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  reconcileBillingCustomer,
  reconcileStripeInvoice,
  reconcileStripeSubscription,
  syncBillingInvoicesForCustomer,
  syncBillingPaymentMethodsForCustomer,
} from "./lib/billingLifecycle";
import { buildWebhookSafeSummary, getWebhookObjectIds } from "./lib/billingStripe";
import { getStripe } from "./lib/stripe";

const http = httpRouter();

http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const event = await validateRequest(request);
    if (!event) {
      return new Response(JSON.stringify({ ok: false }), { status: 400 });
    }

    try {
      switch (event.type) {
        case "user.created": {
          await ctx.runMutation(internal.mutations.users.upsertFromClerk, {
            data: event.data,
          });
          break;
        }
        case "user.updated": {
          await ctx.runMutation(internal.mutations.users.updateFromClerk, {
            data: event.data,
          });
          break;
        }
        case "user.deleted": {
          const id = event.data?.id;
          if (!id) {
            return new Response(
              JSON.stringify({ ok: false, error: "Missing clerk user id" }),
              {
                status: 400,
              },
            );
          }

          await ctx.runMutation(internal.mutations.users.deleteFromClerk, {
            clerkUserId: id,
          });
          break;
        }
        default: {
          console.log("Ignored Clerk webhook event:", event.type);
        }
      }
    } catch (err) {
      console.error("Webhook handler error:", err);
      return new Response(JSON.stringify({ ok: false }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }),
});

function sanitizeStripeWebhookError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 300);
  }

  return "Webhook processing failed.";
}

function sanitizeStripeWebhookSecret(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return value.trim().replace(/^['"]|['"]$/g, "");
}

function getStripeWebhookCryptoProvider() {
  return Stripe.createSubtleCryptoProvider();
}

http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const stripe = getStripe();
    const webhookSecret = sanitizeStripeWebhookSecret(
      process.env.STRIPE_WEBHOOK_SECRET
    );
    const signature = request.headers.get("stripe-signature")?.trim();

    if (!webhookSecret) {
      console.error("Missing STRIPE_WEBHOOK_SECRET");
      return new Response(JSON.stringify({ ok: false }), { status: 503 });
    }

    if (!signature) {
      return new Response(JSON.stringify({ ok: false }), { status: 400 });
    }

    const rawBody = await request.text();

    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecret,
        undefined,
        getStripeWebhookCryptoProvider()
      );
    } catch (error) {
      console.error(
        "Stripe webhook signature verification failed",
        error instanceof Error ? error.message : undefined
      );
      return new Response(JSON.stringify({ ok: false }), { status: 400 });
    }

    const objectIds = getWebhookObjectIds(event);
    const ledgerEntry = await ctx.runMutation(
      internal.mutations.billing.state.recordWebhookEventReceived,
      {
        customerId: objectIds.customerId,
        eventType: event.type,
        invoiceId: objectIds.invoiceId,
        paymentIntentId: objectIds.paymentIntentId,
        payloadJson: JSON.stringify(event),
        safeSummary: buildWebhookSafeSummary(event),
        stripeEventId: event.id,
        subscriptionId: objectIds.subscriptionId,
      }
    );

    const processingClaim = await ctx.runMutation(
      internal.mutations.billing.state.claimWebhookEventProcessing,
      {
        stripeEventId: event.id,
      }
    );

    if (!processingClaim.shouldProcess) {
      return new Response(
        JSON.stringify({
          ok: true,
          duplicate: ledgerEntry.alreadyExists,
          reason: processingClaim.reason,
        }),
        {
          status: 200,
        }
      );
    }

    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          await reconcileStripeSubscription({
            ctx,
            lastStripeEventId: event.id,
            stripe,
            subscription: event.data.object as Stripe.Subscription,
          });

          await ctx.runMutation(
            internal.mutations.billing.state.markWebhookEventProcessed,
            {
              processingStatus: "processed",
              stripeEventId: event.id,
            }
          );
          break;
        }
        case "invoice.payment_action_required":
        case "invoice.payment_failed":
        case "invoice.payment_succeeded": {
          await reconcileStripeInvoice({
            ctx,
            eventType: event.type,
            invoice: event.data.object as Stripe.Invoice,
            lastStripeEventId: event.id,
            stripe,
          });

          await ctx.runMutation(
            internal.mutations.billing.state.markWebhookEventProcessed,
            {
              processingStatus: "processed",
              stripeEventId: event.id,
            }
          );
          break;
        }
        case "invoice.created":
        case "invoice.finalized":
        case "invoice.marked_uncollectible":
        case "invoice.updated":
        case "invoice.voided": {
          const invoice = event.data.object as Stripe.Invoice;
          const stripeCustomerId =
            typeof invoice.customer === "string" ? invoice.customer : undefined;

          if (stripeCustomerId) {
            await syncBillingInvoicesForCustomer({
              ctx,
              stripe,
              stripeCustomerId,
            });
          }

          await ctx.runMutation(
            internal.mutations.billing.state.markWebhookEventProcessed,
            {
              processingStatus: "processed",
              stripeEventId: event.id,
            }
          );
          break;
        }
        case "customer.created":
        case "customer.updated": {
          const stripeCustomer = event.data.object as Stripe.Customer;

          await reconcileBillingCustomer({
            active: true,
            ctx,
            stripe,
            stripeCustomerId: stripeCustomer.id,
          });

          await ctx.runMutation(
            internal.mutations.billing.state.markWebhookEventProcessed,
            {
              processingStatus: "processed",
              stripeEventId: event.id,
            }
          );
          break;
        }
        case "payment_method.attached":
        case "payment_method.detached":
        case "payment_method.updated": {
          const paymentMethod = event.data.object as Stripe.PaymentMethod;

          if (typeof paymentMethod.customer === "string") {
            await syncBillingPaymentMethodsForCustomer({
              ctx,
              stripe,
              stripeCustomerId: paymentMethod.customer,
            });
          }

          await ctx.runMutation(
            internal.mutations.billing.state.markWebhookEventProcessed,
            {
              processingStatus: "processed",
              stripeEventId: event.id,
            }
          );
          break;
        }
        case "setup_intent.succeeded": {
          const setupIntent = event.data.object as Stripe.SetupIntent;

          if (typeof setupIntent.customer === "string") {
            await syncBillingPaymentMethodsForCustomer({
              ctx,
              stripe,
              stripeCustomerId: setupIntent.customer,
            });
          }

          await ctx.runMutation(
            internal.mutations.billing.state.markWebhookEventProcessed,
            {
              processingStatus: "processed",
              stripeEventId: event.id,
            }
          );
          break;
        }
        case "customer.deleted": {
          const deletedCustomer = event.data.object as Stripe.Customer | Stripe.DeletedCustomer;

          if (!("deleted" in deletedCustomer) || !deletedCustomer.deleted) {
            await ctx.runMutation(
              internal.mutations.billing.state.markWebhookEventProcessed,
              {
                processingStatus: "ignored",
                stripeEventId: event.id,
              }
            );
            break;
          }

          const billingContext = await ctx.runQuery(
            internal.queries.billing.internal.getBillingContextByStripeCustomerId,
            {
              stripeCustomerId: deletedCustomer.id,
            }
          );

          if (billingContext) {
            await ctx.runMutation(
              internal.mutations.billing.state.upsertBillingCustomer,
              {
                active: false,
                clerkUserId: billingContext.user.clerkUserId,
                email: billingContext.customer?.email,
                name: billingContext.customer?.name ?? billingContext.user.name,
                stripeCustomerId: deletedCustomer.id,
                userId: billingContext.user._id,
              }
            );
          }

          await ctx.runMutation(
            internal.mutations.billing.state.markWebhookEventProcessed,
            {
              processingStatus: "processed",
              stripeEventId: event.id,
            }
          );
          break;
        }
        default: {
          await ctx.runMutation(
            internal.mutations.billing.state.markWebhookEventProcessed,
            {
              processingStatus: "ignored",
              stripeEventId: event.id,
            }
          );
        }
      }
    } catch (error) {
      const errorMessage = sanitizeStripeWebhookError(error);

      await ctx.runMutation(internal.mutations.billing.state.markWebhookEventFailed, {
        errorMessage,
        stripeEventId: event.id,
      });

      console.error("Stripe webhook processing failed", {
        eventType: event.type,
        stripeEventId: event.id,
      });

      return new Response(JSON.stringify({ ok: false }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }),
});

const validateRequest = async (req: Request): Promise<WebhookEvent | null> => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Missing CLERK_WEBHOOK_SECRET");
    return null;
  }

  const payloadString = await req.text();
  const svixHeaders = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  if (
    !svixHeaders["svix-id"] ||
    !svixHeaders["svix-timestamp"] ||
    !svixHeaders["svix-signature"]
  ) {
    console.error("Missing Svix headers");
    return null;
  }

  const wh = new Webhook(secret);

  try {
    return wh.verify(payloadString, svixHeaders) as WebhookEvent;
  } catch (error) {
    console.error("Error verifying webhook event", error);
    return null;
  }
};

export default http;
