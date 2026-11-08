import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type RadarWidgetProps = {
  title: string;
  detail: string;
  updatedAt: string;
  alert: boolean;
};

const RadarWidgetView = (props: RadarWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const accent = props.alert ? '#FF453A' : '#30D158';

  if (environment.widgetFamily === 'accessoryInline') {
    return <Text>{props.detail ? `${props.title} · ${props.detail}` : props.title}</Text>;
  }

  if (environment.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" modifiers={[containerBackground('#00000000', 'widget')]}>
        <Text modifiers={[font({ weight: 'bold', size: 15 })]}>{props.title}</Text>
        <Text modifiers={[font({ size: 13 })]}>{props.detail}</Text>
      </VStack>
    );
  }

  return (
    <VStack
      alignment="leading"
      modifiers={[containerBackground('#101114', 'widget'), padding({ all: 2 })]}>
      <HStack>
        <Image systemName="dot.radiowaves.left.and.right" color={accent} />
        <Spacer />
        <Text modifiers={[font({ size: 11 }), foregroundStyle('#9A9EA6')]}>{props.updatedAt}</Text>
      </HStack>
      <Spacer />
      <Text modifiers={[font({ weight: 'bold', size: 20 }), foregroundStyle('#FFFFFF')]}>
        {props.title}
      </Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle('#C9CCD1')]}>{props.detail}</Text>
    </VStack>
  );
};

export const RadarWidget = createWidget('RadarWidget', RadarWidgetView, {
  title: 'Radares',
  detail: 'Abra o app para monitorar',
  updatedAt: '',
  alert: false,
});
