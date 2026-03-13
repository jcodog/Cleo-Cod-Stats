"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { IconFileInvoice } from "@tabler/icons-react"

import type { BillingCenterInvoice } from "@/features/billing/lib/billing-types"
import {
  formatBillingStatusLabel,
  formatCardBrandLabel,
  formatCurrencyAmount,
  formatDateLabel,
  formatPaymentMethodTypeLabel,
} from "@/features/billing/lib/format"

function InvoiceDocumentLinks({ invoice }: { invoice: BillingCenterInvoice }) {
  return (
    <div className="flex items-center justify-end gap-3 text-sm">
      {invoice.hostedInvoiceUrl ? (
        <a
          className="text-primary hover:underline"
          href={invoice.hostedInvoiceUrl}
          rel="noreferrer"
          target="_blank"
        >
          View
        </a>
      ) : null}
      {invoice.invoicePdfUrl ? (
        <a
          className="text-primary hover:underline"
          href={invoice.invoicePdfUrl}
          rel="noreferrer"
          target="_blank"
        >
          PDF
        </a>
      ) : null}
    </div>
  )
}

export function InvoiceHistoryTable(args: {
  invoices: BillingCenterInvoice[]
}) {
  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle>Invoices</CardTitle>
        <CardDescription>
          Invoice history for the authenticated billing customer.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {args.invoices.length > 0 ? (
          <>
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Related to</TableHead>
                      <TableHead>Payment method</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="pr-6 text-right">Documents</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {args.invoices.map((invoice) => (
                      <TableRow key={invoice.stripeInvoiceId}>
                        <TableCell className="pl-6 align-top">
                          <div className="flex flex-col gap-1">
                            <div className="font-medium">
                              {invoice.invoiceNumber ?? invoice.stripeInvoiceId}
                            </div>
                            <div className="max-w-[28rem] text-sm text-muted-foreground">
                              {invoice.description}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {formatDateLabel(invoice.issuedAt)}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant={
                              invoice.status === "paid" ? "secondary" : "outline"
                            }
                          >
                            {formatBillingStatusLabel(invoice.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">
                          {invoice.relatedProductName ?? "Subscription"}
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">
                          {invoice.paymentMethodLast4
                            ? `${formatCardBrandLabel(invoice.paymentMethodBrand)} •••• ${invoice.paymentMethodLast4}`
                            : invoice.paymentMethodType
                              ? formatPaymentMethodTypeLabel(
                                  invoice.paymentMethodType
                                )
                              : "Not available"}
                        </TableCell>
                        <TableCell className="align-top font-medium">
                          {formatCurrencyAmount(
                            invoice.amountPaid || invoice.amountDue,
                            invoice.currency
                          )}
                        </TableCell>
                        <TableCell className="pr-6 align-top text-right">
                          <InvoiceDocumentLinks invoice={invoice} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-col md:hidden">
              {args.invoices.map((invoice) => (
                <div
                  className="flex flex-col gap-3 border-t border-border/70 px-6 py-4 first:border-t-0"
                  key={invoice.stripeInvoiceId}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="font-medium">
                        {invoice.invoiceNumber ?? invoice.stripeInvoiceId}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {invoice.description}
                      </div>
                    </div>
                    <Badge
                      variant={invoice.status === "paid" ? "secondary" : "outline"}
                    >
                      {formatBillingStatusLabel(invoice.status)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Date</span>
                      <span>{formatDateLabel(invoice.issuedAt)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-medium">
                        {formatCurrencyAmount(
                          invoice.amountPaid || invoice.amountDue,
                          invoice.currency
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Related to</span>
                      <span>{invoice.relatedProductName ?? "Subscription"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Payment method</span>
                      <span>
                        {invoice.paymentMethodLast4
                          ? `${formatCardBrandLabel(invoice.paymentMethodBrand)} •••• ${invoice.paymentMethodLast4}`
                          : invoice.paymentMethodType
                            ? formatPaymentMethodTypeLabel(
                                invoice.paymentMethodType
                              )
                            : "Not available"}
                      </span>
                    </div>
                  </div>
                  <InvoiceDocumentLinks invoice={invoice} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="px-6 pb-6">
            <Empty className="border border-dashed border-border/70 bg-muted/10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconFileInvoice />
                </EmptyMedia>
                <EmptyTitle>No invoices yet</EmptyTitle>
                <EmptyDescription>
                  Finalized invoices will appear here once Stripe issues them.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
