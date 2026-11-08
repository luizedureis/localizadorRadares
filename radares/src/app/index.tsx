import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDistance } from '@/radar/geo';
import {
  getSnapshot,
  kindLabel,
  RADIUS_OPTIONS,
  startMonitoring,
  stopMonitoring,
  subscribe,
  syncMonitoring,
  updateSettings,
  type MonitorSnapshot,
  type StartResult,
} from '@/radar/monitor';
import type { Target } from '@/radar/types';

const palette = {
  background: '#0B0C0E',
  surface: '#1A1C20',
  surfaceActive: '#34373D',
  text: '#FFFFFF',
  muted: '#A3A7AE',
  green: '#30D158',
  red: '#E5261F',
  stop: '#3A1412',
  stopText: '#FF8A82',
};

const START_ERRORS: Record<Exclude<StartResult, 'ok'>, string> = {
  'location-denied': 'Permita o acesso à localização nos Ajustes para usar o app.',
  'background-denied':
    'Para avisar com o app em segundo plano, escolha “Sempre” em Localização nos Ajustes.',
  'data-failed': 'Não foi possível baixar os radares. Conecte-se à internet e tente de novo.',
};

function dataAge(timestamp: number | null): string {
  if (!timestamp) return '';
  const hours = Math.floor((Date.now() - timestamp) / 3_600_000);
  if (hours < 1) return 'atualizado agora';
  if (hours < 48) return `atualizado há ${hours} h`;
  return `atualizado há ${Math.floor(hours / 24)} dias`;
}

function KeepScreenOn() {
  useKeepAwake();
  return null;
}

function LimitSign({ limit }: { limit: number | null }) {
  return (
    <View
      style={[styles.sign, limit === null && styles.signUnknown]}
      accessibilityLabel={
        limit === null ? 'Limite não informado' : `Limite de ${limit} quilômetros por hora`
      }>
      <Text style={[styles.signValue, limit === null && styles.signValueUnknown]}>
        {limit ?? '?'}
      </Text>
      <Text style={[styles.signUnit, limit === null && styles.signValueUnknown]}>km/h</Text>
    </View>
  );
}

function RadarAhead({ target, speedKmh }: { target: Target; speedKmh: number | null }) {
  const limit = target.radar.limitKmh;
  const speeding = limit !== null && speedKmh !== null && speedKmh > limit;
  const direction =
    target.radar.directionDeg === null
      ? 'Sentido não informado na base'
      : target.directionConfirmed
        ? 'Fiscaliza o seu sentido'
        : 'Sentido não confirmado pelo GPS';

  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <LimitSign limit={limit} />
      <Text style={[styles.distance, speeding && styles.distanceSpeeding]} numberOfLines={1}>
        {formatDistance(target.distance)}
      </Text>
      <Text style={styles.headline}>{kindLabel(target.radar)} à frente</Text>
      <Text style={styles.caption}>{direction}</Text>
    </View>
  );
}

function Idle({ snapshot }: { snapshot: MonitorSnapshot }) {
  let title = 'Pronto para sair';
  let caption = 'Toque em Iniciar antes de dirigir.';
  if (snapshot.running && snapshot.waitingForMovement) {
    title = 'Aguardando movimento';
    caption = 'O sentido da via é calculado quando o carro anda.';
  } else if (snapshot.running) {
    title = 'Nenhum radar à frente';
    caption = `Avisamos até ${formatDistance(snapshot.settings.radius)} antes do radar.`;
  }
  return (
    <View style={styles.center}>
      <Text style={styles.idleTitle}>{title}</Text>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Exclude<StartResult, 'ok'> | null>(null);
  const { running, target, speedKmh, data, settings } = snapshot;

  useEffect(() => {
    syncMonitoring().catch(() => {});
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (running) {
        await stopMonitoring();
      } else {
        const result = await startMonitoring();
        if (result !== 'ok') setError(result);
      }
    } catch {
      setError('location-denied');
    } finally {
      setBusy(false);
    }
  }

  const dataLine = data.states.length
    ? `${data.states.join(', ')} · ${data.count.toLocaleString('pt-BR')} radares · ${dataAge(data.oldestUpdate)}`
    : 'Os radares do seu estado são baixados ao iniciar';

  return (
    <SafeAreaView style={styles.screen}>
      {running && <KeepScreenOn />}

      <View style={styles.header}>
        <View style={styles.status}>
          <View style={[styles.dot, running && styles.dotOn]} />
          <Text style={styles.statusText}>{running ? 'Monitorando' : 'Desligado'}</Text>
        </View>
        {speedKmh !== null && <Text style={styles.speed}>{speedKmh} km/h</Text>}
      </View>

      {target ? <RadarAhead target={target} speedKmh={speedKmh} /> : <Idle snapshot={snapshot} />}

      <View style={styles.footer}>
        {error && (
          <Pressable
            onPress={error === 'data-failed' ? undefined : () => Linking.openSettings()}
            accessibilityRole={error === 'data-failed' ? undefined : 'link'}>
            <Text style={styles.error}>{START_ERRORS[error]}</Text>
          </Pressable>
        )}

        <View style={styles.row}>
          <Text style={styles.label}>Avisar a</Text>
          <View style={styles.segments}>
            {RADIUS_OPTIONS.map((radius) => {
              const selected = settings.radius === radius;
              return (
                <Pressable
                  key={radius}
                  onPress={() => updateSettings({ radius })}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.segment, selected && styles.segmentSelected]}>
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                    {formatDistance(radius)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Falar os avisos</Text>
          <Switch
            value={settings.voice}
            onValueChange={(voice) => updateSettings({ voice })}
            accessibilityLabel="Falar os avisos"
          />
        </View>

        <Pressable
          onPress={toggle}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            running && styles.buttonStop,
            (pressed || busy) && styles.buttonDimmed,
          ]}>
          <Text style={[styles.buttonText, running && styles.buttonTextStop]}>
            {busy ? 'Aguarde…' : running ? 'Parar' : 'Iniciar'}
          </Text>
        </Pressable>

        <Text style={styles.credit}>{dataLine}</Text>
        <Text style={styles.credit}>
          Dados: Pardal (ODbL) · © colaboradores do OpenStreetMap. A sinalização da via sempre
          prevalece.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.muted },
  dotOn: { backgroundColor: palette.green },
  statusText: { color: palette.text, fontSize: 17, fontWeight: '600' },
  speed: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  sign: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 15,
    borderColor: palette.red,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  signUnknown: { borderColor: palette.surfaceActive, backgroundColor: palette.surface },
  signValue: {
    color: '#000000',
    fontSize: 50,
    lineHeight: 54,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  signValueUnknown: { color: palette.muted },
  signUnit: { color: '#000000', fontSize: 13, fontWeight: '700' },
  distance: {
    color: palette.text,
    fontSize: 88,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  distanceSpeeding: { color: '#FF5A52' },
  headline: { color: palette.text, fontSize: 22, fontWeight: '600' },
  caption: { color: palette.muted, fontSize: 16, textAlign: 'center' },
  idleTitle: { color: palette.text, fontSize: 30, fontWeight: '700', textAlign: 'center' },
  footer: { gap: 12, paddingBottom: 8 },
  error: { color: '#FF8A82', fontSize: 15, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  label: { color: palette.text, fontSize: 16 },
  segments: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: 10,
    padding: 3,
  },
  segment: { minHeight: 38, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center' },
  segmentSelected: { backgroundColor: palette.surfaceActive },
  segmentText: { color: palette.muted, fontSize: 15, fontWeight: '600' },
  segmentTextSelected: { color: palette.text },
  button: {
    height: 64,
    borderRadius: 16,
    backgroundColor: palette.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonStop: { backgroundColor: palette.stop },
  buttonDimmed: { opacity: 0.6 },
  buttonText: { color: '#04210D', fontSize: 22, fontWeight: '800' },
  buttonTextStop: { color: palette.stopText },
  credit: { color: palette.muted, fontSize: 12, textAlign: 'center' },
});
