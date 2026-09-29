import type { EmailMessage } from './providers.ts';

export type InvitationEmail = {
  resourceName: string; resourceType: 'group' | 'list'; role: string; inviterName: string; expiresAt: string;
};
export type ReportEmail = {
  year: number; month: number; currencyCode: string; decimalDigits: number; scopeName: string;
  totalBudget: number; totalPurchased: number; totalVariance: number;
  items: { categoryName: string; budgeted: number; purchased: number; variance: number }[];
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Formats an amount with its ISO 4217 code, always making the currency explicit (e.g. "25,000 XAF"). */
export function formatMoney(amount: number, currencyCode: string, decimalDigits: number): string {
  const number = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimalDigits, maximumFractionDigits: decimalDigits }).format(amount);
  return `${number} ${currencyCode}`;
}

const layout = (heading: string, body: string, actionUrl: string, actionLabel: string) => `<!doctype html>
<html><body style="margin:0;background:#F7F8F3;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1C2B22">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="font-size:20px;font-weight:800;color:#22784B;margin:0 0 20px">Grocefy</p>
<div style="background:#fff;border:1px solid #E2E7E1;border-radius:16px;padding:22px">
<h1 style="font-size:20px;margin:0 0 14px">${heading}</h1>${body}
<p style="margin:22px 0 0"><a href="${escapeHtml(actionUrl)}" style="background:#22784B;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;display:inline-block">${actionLabel}</a></p>
</div>
<p style="font-size:12px;color:#69756D;margin-top:18px">You can turn off email notifications in Grocefy under Settings.</p>
</div></body></html>`;

/** Invitation emails name the resource and role only; list contents stay private until the invitation is accepted. */
export function renderInvitation(invitation: InvitationEmail, appUrl: string): Omit<EmailMessage, 'to'> {
  const role = titleCase(invitation.role);
  const expires = new Date(invitation.expiresAt).toUTCString().slice(0, 16);
  const subject = `You have been invited to join ${invitation.resourceName}`;
  const actionUrl = `${appUrl.replace(/\/$/, '')}/inbox`;
  return {
    subject,
    text: `${subject}.\n\n${invitation.inviterName} invited you to the ${invitation.resourceType} "${invitation.resourceName}".\nRole: ${role}\n\nOpen Grocefy to accept: ${actionUrl}\nThis invitation expires on ${expires}.`,
    html: layout(escapeHtml(subject), `<p style="margin:0 0 8px">${escapeHtml(invitation.inviterName)} invited you to the ${invitation.resourceType} <strong>${escapeHtml(invitation.resourceName)}</strong>.</p>
<p style="margin:0 0 8px">Role: <strong>${escapeHtml(role)}</strong></p><p style="margin:0;color:#69756D;font-size:13px">This invitation expires on ${escapeHtml(expires)}. Sign in with this email address to accept it.</p>`,
      actionUrl, 'Accept invitation')
  };
}

/** Monthly statement. Every amount carries its currency code; one email covers exactly one currency. */
export function renderMonthlyReport(report: ReportEmail, appUrl: string): Omit<EmailMessage, 'to'> {
  const period = new Date(Date.UTC(report.year, report.month - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const money = (amount: number) => formatMoney(amount, report.currencyCode, report.decimalDigits);
  const savings = -report.totalVariance;
  const subject = `${period} Finance Report — ${report.scopeName} (${report.currencyCode})`;
  const actionUrl = `${appUrl.replace(/\/$/, '')}/reports`;
  const outcome = savings >= 0 ? `Savings: ${money(savings)}` : `Over budget: ${money(-savings)}`;
  const rows = report.items.map((item) => `<tr><td style="padding:6px 0">${escapeHtml(item.categoryName)}</td><td style="padding:6px 0;text-align:right">${money(item.budgeted)}</td><td style="padding:6px 0;text-align:right">${money(item.purchased)}</td></tr>`).join('');
  return {
    subject,
    text: [`${period} Finance Report`, report.scopeName, `Currency: ${report.currencyCode}`, '', `Budget: ${money(report.totalBudget)}`, `Actual: ${money(report.totalPurchased)}`, outcome, '',
      'By category (budget / actual):', ...report.items.map((item) => `- ${item.categoryName}: ${money(item.budgeted)} / ${money(item.purchased)}`), '', `Open Grocefy: ${actionUrl}`].join('\n'),
    html: layout(`${escapeHtml(period)} Finance Report`, `<p style="margin:0 0 4px">${escapeHtml(report.scopeName)}</p><p style="margin:0 0 14px;color:#69756D">Currency: <strong>${escapeHtml(report.currencyCode)}</strong></p>
<p style="margin:0 0 4px">Budget: <strong>${money(report.totalBudget)}</strong></p><p style="margin:0 0 4px">Actual: <strong>${money(report.totalPurchased)}</strong></p>
<p style="margin:0 0 16px;font-weight:700;color:${savings >= 0 ? '#22784B' : '#C84D4D'}">${outcome}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="color:#69756D;text-align:left"><th style="font-weight:600">Category</th><th style="text-align:right;font-weight:600">Budget</th><th style="text-align:right;font-weight:600">Actual</th></tr>${rows}</table>`,
      actionUrl, 'View report')
  };
}
