import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type RadarActivityProps = {
  title: string;
  distance: string;
  limit: string;
  alert: boolean;
};

const RadarActivityView = (props: RadarActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const accent = environment.isLuminanceReduced ? '#FFFFFF' : props.alert ? '#FF453A' : '#30D158';
  const icon = props.alert ? 'exclamationmark.triangle.fill' : 'dot.radiowaves.left.and.right';

  return {
    banner: (
      <HStack modifiers={[padding({ all: 16 })]}>
        <Image systemName={icon} color={accent} size={26} />
        <VStack alignment="leading" modifiers={[padding({ leading: 10 })]}>
          <Text modifiers={[font({ weight: 'bold', size: 17 })]}>{props.title}</Text>
          <Text modifiers={[font({ size: 14 })]}>{props.limit}</Text>
        </VStack>
        <Spacer />
        <Text modifiers={[font({ weight: 'bold', size: 30 }), foregroundStyle(accent)]}>
          {props.distance}
        </Text>
      </HStack>
    ),
    compactLeading: <Image systemName={icon} color={accent} />,
    compactTrailing: (
      <Text modifiers={[font({ weight: 'bold', size: 14 }), foregroundStyle(accent)]}>
        {props.distance}
      </Text>
    ),
    minimal: <Image systemName={icon} color={accent} />,
    expandedLeading: (
      <HStack modifiers={[padding({ leading: 8 })]}>
        <Image systemName={icon} color={accent} size={24} />
      </HStack>
    ),
    expandedTrailing: (
      <Text
        modifiers={[
          font({ weight: 'bold', size: 26 }),
          foregroundStyle(accent),
          padding({ trailing: 8 }),
        ]}>
        {props.distance}
      </Text>
    ),
    expandedBottom: (
      <VStack alignment="leading" modifiers={[padding({ horizontal: 8 })]}>
        <Text modifiers={[font({ weight: 'bold', size: 16 })]}>{props.title}</Text>
        <Text modifiers={[font({ size: 14 })]}>{props.limit}</Text>
      </VStack>
    ),
  };
};

export const RadarActivity = createLiveActivity('RadarActivity', RadarActivityView);
