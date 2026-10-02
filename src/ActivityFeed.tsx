import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { describeActivity, timeAgo } from './activity';
import { Activity } from './services/activity';
import { Card, palette } from './ui';

/** "Recent activity": who added, changed, purchased, or joined, newest first. */
export function ActivityFeed({ entries, initialCount = 5 }: { entries: Activity[]; initialCount?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;
  const shown = expanded ? entries : entries.slice(0, initialCount);
  return <View style={{ gap: 8 }}>
    <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16, marginTop: 6 }}>Recent activity</Text>
    <Card style={{ paddingVertical: 6 }}>{shown.map((entry, index) => <View key={entry.id} style={{ paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderColor: palette.line }}>
      <Text style={{ color: palette.ink, lineHeight: 20 }}>{describeActivity(entry)}</Text>
      <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>{timeAgo(entry.created_at)}</Text>
    </View>)}
      {entries.length > initialCount && <Text accessibilityRole="button" onPress={() => setExpanded(!expanded)} style={{ color: palette.green, fontWeight: '800', paddingVertical: 10 }}>{expanded ? 'Show less' : `Show all ${entries.length}`}</Text>}
    </Card>
  </View>;
}
