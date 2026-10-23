// Run locally. Keep the private key out of Git and frontend environment variables.
import {createECDH} from 'node:crypto';
const key=createECDH('prime256v1');key.generateKeys();
console.log('Add these ONLY to the API Function and private worker Function variables:');
console.log('PUSH_VAPID_PUBLIC_KEY='+key.getPublicKey().toString('base64url'));
console.log('PUSH_VAPID_PRIVATE_KEY='+key.getPrivateKey().toString('base64url'));
console.log('PUSH_VAPID_SUBJECT=mailto:REPLACE_WITH_YOUR_SUPPORT_EMAIL');
console.log('Never share screenshots of the private key. Keep the same pair on both Functions.');
