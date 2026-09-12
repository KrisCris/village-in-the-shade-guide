import { existsSync } from 'node:fs';

const required = ['save.001', 'save.002', 'save.003', 'save.004', 'save.005', '.systemsave'];
export const hasPrivateSaveFixtures = process.env.SAVE_EDITOR_SKIP_PRIVATE_FIXTURES !== '1'
  && required.every(name => existsSync(`tests/gamesave/${name}`));
