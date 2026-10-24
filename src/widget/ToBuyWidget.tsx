'use no memo'; // widgets are plain functions rendered off-screen: no React Compiler, hooks, or fragments
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { formatCurrency } from '../currency';
import type { WidgetSnapshot } from './snapshot';

export const widgetName = 'ToBuy';

// The app's palette (src/ui.tsx); widgets need literal hex colors.
const colors = { ink: '#1C2B22', muted: '#69756D', green: '#22784B', pale: '#EAF6EE', white: '#FFFFFF', orange: '#E68A36', red: '#C84D4D' } as const;

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center' }}>
    <FlexWidget style={{ flex: 1 }}>
      <TextWidget text={title} style={{ fontSize: 16, fontWeight: '800', color: colors.ink }} maxLines={1} truncate="END"/>
      <TextWidget text={subtitle} style={{ fontSize: 12, color: colors.muted }} maxLines={1} truncate="END"/>
    </FlexWidget>
    <TextWidget text="↻" clickAction="REFRESH" accessibilityLabel="Refresh" style={{ fontSize: 20, color: colors.green, paddingHorizontal: 6 }}/>
  </FlexWidget>;
}

function Frame({ children }: { children: React.ReactNode }) {
  return <FlexWidget clickAction="OPEN_APP" accessibilityLabel="Open Grocefy"
    style={{ width: 'match_parent', height: 'match_parent', backgroundColor: colors.white, borderRadius: 20, padding: 14, flexGap: 8 }}>{children}</FlexWidget>;
}

/**
 * The To-buy widget: the home's name, how much is left to buy, and what is running low or finished. Tapping it opens
 * the app; the round arrow refreshes it. `height` (dp) decides how many items fit.
 */
export function ToBuyWidget({ snapshot, height = 180 }: { snapshot: WidgetSnapshot | null; height?: number }) {
  if (!snapshot) return <Frame>
    <Header title="Grocefy" subtitle="To buy"/>
    <TextWidget text="Open Grocefy and sign in to see what needs buying at home." style={{ fontSize: 13, color: colors.muted }}/>
  </Frame>;

  const total = snapshot.toBuy.length ? snapshot.toBuy.map((entry) => formatCurrency(entry.amount, entry.currencyCode)).join(' · ') : null;
  // Header and total take about 80dp; each item row about 22dp.
  const fits = Math.max(1, Math.floor((height - 80) / 22));
  const shown = snapshot.needed.slice(0, snapshot.needed.length > fits ? fits - 1 : fits);
  const more = snapshot.needed.length - shown.length;
  return <Frame>
    <Header title={snapshot.homeName} subtitle={snapshot.needed.length ? `${snapshot.needed.length} ${snapshot.needed.length === 1 ? 'thing needs' : 'things need'} buying` : 'Nothing needs buying'}/>
    {total && <FlexWidget style={{ backgroundColor: colors.pale, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, width: 'match_parent' }}>
      <TextWidget text={`To buy ${total}`} style={{ fontSize: 14, fontWeight: '700', color: colors.green }} maxLines={1} truncate="END"/>
    </FlexWidget>}
    {shown.map((item, index) => <FlexWidget key={`${item.name}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
      <FlexWidget style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.status === 'out' ? colors.red : colors.orange, marginRight: 8 }}/>
      <TextWidget text={item.name} style={{ fontSize: 14, color: colors.ink }} maxLines={1} truncate="END"/>
      <TextWidget text={item.status === 'out' ? '  Finished' : '  Low'} style={{ fontSize: 12, color: item.status === 'out' ? colors.red : colors.orange }}/>
    </FlexWidget>)}
    {more > 0 && <TextWidget text={`+ ${more} more`} style={{ fontSize: 12, color: colors.muted }}/>}
    {!snapshot.needed.length && <TextWidget text="Everything at home is in stock." style={{ fontSize: 13, color: colors.muted }}/>}
  </Frame>;
}
