import {kindLabels, primaryKinds} from './types';

// Shared by the database landing page and sidebar so their entries stay aligned.
export const databaseLinks = [
  ...primaryKinds.filter(kind => kind !== 'items').map(kind => ({
    kind, label: kindLabels[kind], href: `/data/${kind}/`,
  })),
  {kind: 'items', label: '物品分类', href: '/categories/'},
  {kind: 'items', label: '全部物品', href: '/data/items/'},
];
