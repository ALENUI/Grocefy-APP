import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { formatCurrency } from '@/src/currency';
import { generateMonthlyReport, fetchMonthlyReports, MonthlyReportWithItems, ReportScope } from '@/src/services/finance';
import { friendlyError } from '@/src/services/errors';
import { fetchPurchasesInPeriod, periodLabel, purchasesCsv, reportCsv, shareCsv } from '@/src/services/exports';
import { fetchGroups } from '@/src/services/groups';
import { useUserId } from '@/src/session';
import { useAsync } from '@/src/useAsync';
import { Button, Card, Chip, EmptyState, ErrorNotice, Heading, Loading, palette, Screen } from '@/src/ui';

const monthLabel = (year: number, month: number) => new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export default function Reports() {
  const userId = useUserId();
  const today = new Date();
  const [period, setPeriod] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [scope, setScope] = useState<ReportScope>({ kind: 'personal' });
  // Group reports are for owners and partners.
  const groups = useAsync(async () => (await fetchGroups(userId)).filter((group) => group.role === 'owner' || group.role === 'partner'), [userId]);
  const scopeKey = scope.kind === 'group' ? scope.groupId : scope.kind;
  const reports = useAsync(async () => {
    // Generation is idempotent: it refreshes the current month and returns closed months as issued.
    await generateMonthlyReport(period.year, period.month, scope);
    return fetchMonthlyReports({ scope, year: period.year, month: period.month });
  }, [period.year, period.month, scopeKey]);
  const isCurrentMonth = period.year === today.getFullYear() && period.month === today.getMonth() + 1;
  const shift = (delta: number) => setPeriod(({ year, month }) => { const next = new Date(year, month - 1 + delta, 1); return { year: next.getFullYear(), month: next.getMonth() + 1 }; });

  return <Screen refreshing={reports.loading && !!reports.data} onRefresh={reports.reload}>
    <Heading title="Finance report" subtitle="Budgeted vs purchased, by category"/>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Chip label="My purchases" selected={scope.kind === 'personal'} onPress={() => setScope({ kind: 'personal' })}/>
      {(groups.data ?? []).map((group) => <Chip key={group.id} label={group.name} selected={scope.kind === 'group' && scope.groupId === group.id} onPress={() => setScope({ kind: 'group', groupId: group.id })}/>)}
    </View>
    <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Pressable accessibilityLabel="Previous month" hitSlop={10} onPress={() => shift(-1)}><Ionicons name="chevron-back" size={22} color={palette.green}/></Pressable>
      <View style={{ alignItems: 'center' }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 17 }}>{monthLabel(period.year, period.month)}</Text>
        <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>{isCurrentMonth ? 'Month to date' : 'Final statement'}</Text></View>
      <Pressable accessibilityLabel="Next month" hitSlop={10} disabled={isCurrentMonth} onPress={() => shift(1)} style={{ opacity: isCurrentMonth ? 0.3 : 1 }}><Ionicons name="chevron-forward" size={22} color={palette.green}/></Pressable>
    </View></Card>
    {reports.error ? <ErrorNotice error={reports.error} onRetry={reports.reload}/> : !reports.data ? <Loading/> : reports.data.length === 0
      ? <EmptyState title="No purchases this month" message="Reports are built from confirmed purchases. Each currency gets its own statement."/>
      : reports.data.map((report) => <ReportCard key={report.id} report={report} userId={userId}
          scopeName={scope.kind === 'group' ? groups.data?.find((group) => group.id === scope.groupId)?.name ?? 'Group' : 'My purchases'}/>)}
    {reports.data && reports.data.length > 1 && <Text style={{ color: palette.muted, lineHeight: 20 }}>Purchases in different currencies are reported separately. Grocefy never adds different currencies together.</Text>}
  </Screen>;
}

function ReportCard({ report, scopeName, userId }: { report: MonthlyReportWithItems; scopeName: string; userId: string }) {
  const code = report.currency_code;
  const under = report.total_variance <= 0;
  const [exporting, setExporting] = useState<'statement' | 'purchases'>();
  const fileName = `grocefy-${scopeName}-${periodLabel(report)}-${code}`;
  const run = async (kind: 'statement' | 'purchases', build: () => Promise<string>) => {
    setExporting(kind);
    try { await shareCsv(`${fileName}-${kind}`, await build(), `Export ${scopeName} ${periodLabel(report)}`); }
    catch (caught) { Alert.alert('Could not export', caught instanceof Error && !('code' in caught) ? caught.message : friendlyError(caught)); }
    finally { setExporting(undefined); }
  };
  const exportPurchases = () => run('purchases', async () => {
    if (!report.period_start || !report.period_end) throw new Error('This report has no period boundaries; regenerate it first.');
    const scope = report.group_id ? { groupId: report.group_id } : { userId };
    return purchasesCsv(await fetchPurchasesInPeriod(scope, report.period_start, report.period_end, code));
  });
  return <Card>
    <Text style={{ color: palette.green, fontWeight: '800', fontSize: 13 }}>CURRENCY: {code}</Text>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
      <Metric label="Budget" value={formatCurrency(report.total_budget, code)}/><Metric label="Actual" value={formatCurrency(report.total_purchased, code)}/>
    </View>
    <Text style={{ marginTop: 12, color: under ? palette.green : palette.red, fontWeight: '800' }}>{under ? `Saved ${formatCurrency(-report.total_variance, code)}` : `Over budget by ${formatCurrency(report.total_variance, code)}`}</Text>
    <View style={{ marginTop: 14, borderTopWidth: 1, borderColor: palette.line, paddingTop: 12, gap: 9 }}>
      <Text style={{ color: palette.ink, fontWeight: '800' }}>By category</Text>
      {[...report.items].sort((a, b) => b.purchased_amount - a.purchased_amount).map((item) => <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <Text style={{ color: palette.muted, flex: 1 }}>{item.category_name_snapshot} · {item.item_count}</Text>
        <View style={{ alignItems: 'flex-end' }}><Text style={{ color: palette.ink, fontWeight: '700' }}>{formatCurrency(item.purchased_amount, code)} / {formatCurrency(item.budgeted_amount, code)}</Text>
          {item.variance !== 0 && <Text style={{ color: item.variance < 0 ? palette.green : palette.red, fontSize: 12 }}>{item.variance < 0 ? '−' : '+'}{formatCurrency(Math.abs(item.variance), code)}</Text>}</View>
      </View>)}
    </View>
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
      <View style={{ flex: 1 }}><Button label="Statement CSV" variant="soft" icon="download-outline" loading={exporting === 'statement'} disabled={!!exporting}
        onPress={() => run('statement', async () => reportCsv(report, scopeName))}/></View>
      <View style={{ flex: 1 }}><Button label="Purchases CSV" variant="soft" icon="receipt-outline" loading={exporting === 'purchases'} disabled={!!exporting} onPress={exportPurchases}/></View>
    </View>
  </Card>;
}
function Metric({ label, value }: { label: string; value: string }) { return <View><Text style={{ color: palette.muted, fontSize: 13 }}>{label}</Text><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 18, marginTop: 4 }}>{value}</Text></View>; }
