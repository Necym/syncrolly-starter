declare module '@expo/vector-icons' {
  import type { ComponentType } from 'react';
  import type { TextProps } from 'react-native';

  type IconProps = TextProps & {
    color?: string;
    name: string;
    size?: number;
  };

  export const Ionicons: ComponentType<IconProps>;
}
