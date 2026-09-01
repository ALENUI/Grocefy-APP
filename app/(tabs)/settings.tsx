import React from 'react';
import { Text, View } from 'react-native';
import { currencyLabel } from '@/src/currency';
import { useGrocefy } from '@/src/store';
import { Card, CurrencyPicker, Heading, Screen, styles } from '@/src/ui';

export default function Settings() { const { settings, setDefaultCurrency } = useGrocefy(); return <Screen><Heading title="Settings" subtitle="Your preferences for new shopping lists"/><Card><Text style={styles.label}>Default currency</Text><Text style={{ color: '#69756D', fontSize: 13, marginTop: 5, marginBottom: 14 }}>New lists use this currency. Existing lists retain their original currency.</Text><CurrencyPicker value={settings.defaultCurrency} onChange={setDefaultCurrency}/></Card><Card><Text style={styles.label}>Available currencies</Text><Text style={{ color: '#69756D', marginTop: 7, lineHeight: 20 }}>Grocefy supports an extensible ISO 4217 currency registry. Financial records always preserve the currency code used at purchase time.</Text><View style={{ marginTop: 14, backgroundColor: '#EAF6EE', padding: 12, borderRadius: 11 }}><Text style={{ color: '#22784B', fontWeight: '700' }}>Current default: {currencyLabel(settings.defaultCurrency)}</Text></View></Card></Screen>; }
