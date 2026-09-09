import { validateLayout } from './world';

self.onmessage = () => {
  self.postMessage(validateLayout());
};