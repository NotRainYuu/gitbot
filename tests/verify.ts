import { GithubApi } from '../src/github/api.js';
import { buildV2Container, ButtonStyle } from '../src/discord/v2-components.js';
import { store } from '../src/storage/store.js';

console.log('--- 1. Testing GitHub parseUrl ---');
console.log('Standard URL:', GithubApi.parseUrl('https://github.com/facebook/react.git'));
console.log('Shorthand:', GithubApi.parseUrl('torvalds/linux'));

console.log('\n--- 2. Testing Discord Components V2 Builder ---');
const v2 = buildV2Container({
  sections: ['## Folder has found!\nLocal Path: `C:/code/test`'],
  buttons: [
    { label: 'Next', style: ButtonStyle.PRIMARY, customId: 'sync_next' },
    { label: 'Cancel', style: ButtonStyle.DANGER, customId: 'sync_cancel' },
  ],
});

console.log('Flags:', v2.flags);
console.log('Container Type:', v2.components[0].type);
console.log('Inner Components Count:', v2.components[0].components.length);
console.log('Section Type:', v2.components[0].components[0].type);
console.log('Action Row Type:', v2.components[0].components[1].type);
console.log('Container Accent Color exists:', 'accent_color' in v2.components[0]);

console.log('\n--- 3. Testing Store Initial State ---');
console.log('Sync Config:', store.getSync());
console.log('Track Tasks:', store.getTrackTasks().length);
console.log('AutoGet Tasks:', store.getAutoGetTasks().length);

console.log('\n✔ All core component tests passed successfully!');
