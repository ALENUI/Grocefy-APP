import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatCurrency } from './currency';
import { palette } from './ui';

// Chart colors, validated with the dataviz skill's palette checker (light surface, CVD-separated: ΔE 21).
// Text never uses these: labels and values stay in the ink tokens.
// A getter, so the green follows the light or dark theme.
const series = { get paid() { return palette.green; }, budget: '#2a78d6' };
const plotHeight = 112;
const maxColumnWidth = 24;

/** Column geometry per spec: ≤24px thick, 4px rounded data end, square at the baseline, air between columns. */
function Column({ height, width, color }: { height: number; width: number; color: string }) {
  return <View style={{ width, height: Math.max(height, 2), backgroundColor: color, borderTopLeftRadius: 4, borderTopRightRadius: 4 }}/>;
}

export type PricePoint = { value: number; date: string };

/**
 * Unit price per purchase over time, for one product in one currency (never mixed). Single series, so no legend;
 * only the latest price is labeled. Tapping a column shows its value and date; the history list is the table view.
 */
export function PriceColumns({ points, currencyCode }: { points: PricePoint[]; currencyCode: string }) {
  const [selected, setSelected] = useState<number>();
  if (points.length < 2) return null;
  const max = Math.max(...points.map((point) => point.value));
  const last = points.length - 1;
  const active = selected ?? last;
  return <View accessible accessibilityLabel={`Price trend in ${currencyCode}: ${points.map((point) => formatCurrency(point.value, currencyCode)).join(', ')}`}>
    <Text style={{ color: palette.muted, fontSize: 12 }}>Highest {formatCurrency(max, currencyCode)}</Text>
    <View style={{ height: plotHeight, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderColor: palette.line, marginTop: 6 }}>
      {points.map((point, index) => <Pressable key={index} onPress={() => setSelected(index)} hitSlop={4} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
        <Column height={(point.value / max) * (plotHeight - 4)} width={maxColumnWidth} color={index === active ? series.paid : `${series.paid}99`}/>
      </Pressable>)}
    </View>
    <Text style={{ color: palette.ink, fontWeight: '700', marginTop: 8 }}>
      {formatCurrency(points[active].value, currencyCode)} <Text style={{ color: palette.muted, fontWeight: '400' }}>· {new Date(points[active].date).toLocaleDateString()}{active === last ? ' · latest' : ''}</Text>
    </Text>
  </View>;
}

export type SpendMonth = { label: string; paid: number; budget: number };

/**
 * Paid (columns) against budget (a tick across each column) per month, one currency per chart. Two series, so a
 * legend is shown; the latest month is labeled and tapping a month shows its figures. Over-budget is stated in text
 * with an icon, never by recoloring the column (status colors are reserved).
 */
export function SpendColumns({ months, currencyCode }: { months: SpendMonth[]; currencyCode: string }) {
  const [selected, setSelected] = useState<number>();
  if (months.length === 0) return null;
  const max = Math.max(1, ...months.flatMap((month) => [month.paid, month.budget]));
  const active = selected ?? months.length - 1;
  const month = months[active];
  const over = month.paid - month.budget;
  const scale = (value: number) => (value / max) * (plotHeight - 4);
  return <View>
    <View style={{ flexDirection: 'row', gap: 16, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: series.paid }}/><Text style={{ color: palette.muted, fontSize: 12 }}>Paid</Text></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 2, backgroundColor: series.budget }}/><Text style={{ color: palette.muted, fontSize: 12 }}>Budget</Text></View>
    </View>
    <View style={{ height: plotHeight, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderColor: palette.line }}>
      {months.map((entry, index) => <Pressable key={entry.label} onPress={() => setSelected(index)} hitSlop={4}
        accessibilityLabel={`${entry.label}: paid ${formatCurrency(entry.paid, currencyCode)}, budget ${formatCurrency(entry.budget, currencyCode)}`}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
        <Column height={scale(entry.paid)} width={maxColumnWidth} color={index === active ? series.paid : `${series.paid}99`}/>
        {entry.budget > 0 && <View style={{ position: 'absolute', bottom: scale(entry.budget) - 1, width: maxColumnWidth + 10, height: 2, backgroundColor: series.budget }}/>}
      </Pressable>)}
    </View>
    <View style={{ flexDirection: 'row', marginTop: 4 }}>{months.map((entry, index) => <Text key={entry.label} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: index === active ? palette.ink : palette.muted, fontWeight: index === active ? '700' : '400' }}>{entry.label}</Text>)}</View>
    <View style={{ marginTop: 10, gap: 3 }}>
      <Text style={{ color: palette.ink, fontWeight: '700' }}>Paid {formatCurrency(month.paid, currencyCode)} <Text style={{ color: palette.muted, fontWeight: '400' }}>of {formatCurrency(month.budget, currencyCode)} budgeted</Text></Text>
      {month.paid > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Ionicons name={over > 0 ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={15} color={over > 0 ? palette.red : palette.green}/>
        <Text style={{ color: palette.muted, fontSize: 13 }}>{over > 0 ? `Over budget by ${formatCurrency(over, currencyCode)}` : `Under budget by ${formatCurrency(-over, currencyCode)}`}</Text>
      </View>}
    </View>
  </View>;
}
