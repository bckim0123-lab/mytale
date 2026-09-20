export type CreatureKind = 'sprout' | 'bunny' | 'cat' | 'bear';

export type CreatureAccessory = 'star' | 'flower' | 'scarf';

export type CreatureAppearance = {
  kind: CreatureKind;
  bodyColor: string;
  accentColor: string;
  accessory: CreatureAccessory;
};

export const DEFAULT_APPEARANCE: CreatureAppearance = {
  kind: 'sprout',
  bodyColor: '#fff0d9',
  accentColor: '#85bca2',
  accessory: 'star',
};

export type CreatureAction = 'idle' | 'wave' | 'hop' | 'celebrate' | 'curious' | 'pet' | 'sleep';

export type CreatureFrame = {
  moving: boolean;
  speed?: number;
  action?: CreatureAction;
  lookX?: number;
  lookY?: number;
  reducedMotion?: boolean;
};
