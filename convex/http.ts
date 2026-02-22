import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";

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
