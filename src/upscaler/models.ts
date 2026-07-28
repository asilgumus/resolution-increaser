/** Model registry: lazy per-scale imports so 4x weights only fetch on demand. */

import type Upscaler from 'upscaler';
import type { Scale } from '../types';

type Model = NonNullable<NonNullable<ConstructorParameters<typeof Upscaler>[0]>['model']>;

const loaders: Record<Scale, () => Promise<Model>> = {
  2: () => import('@upscalerjs/esrgan-slim/2x').then((m) => m.default),
  4: () => import('@upscalerjs/esrgan-slim/4x').then((m) => m.default),
};

/** Load (and cache) the model definition for a given scale. */
export function loadModel(scale: Scale): Promise<Model> {
  return loaders[scale]();
}