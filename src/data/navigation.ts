import {kindLabels, primaryKinds} from './types';
import {msg} from '../i18n/translate';

// Shared by the database landing page and sidebar so their entries stay aligned.
// Labels are translation keys; pages pass them through t().
export const databaseLinks = [
  ...primaryKinds.filter(kind => kind !== 'items').map(kind => ({
    kind, label: kindLabels[kind], href: `/data/${kind}/`,
  })),
  {kind: 'items', label: msg('物品分类'), href: '/categories/'},
  {kind: 'items', label: msg('全部物品'), href: '/data/items/'},
];
