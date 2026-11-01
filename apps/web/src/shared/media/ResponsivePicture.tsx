import { useState } from 'react';
import type { SceneLayer } from './types.ts';
import { media } from '../../styles/breakpoints.ts';
export function ResponsivePicture({
  asset,
  onFailure,
}: {
  asset: SceneLayer;
  onFailure?: () => void;
}) {
  const [fallback, setFallback] = useState(false);
  return (
    <picture>
      {!fallback && (
        <>
          <source media={media.phone} type="image/webp" srcSet={asset.variants.mobile.url} />
          <source type="image/webp" srcSet={asset.variants.desktop.url} />
        </>
      )}
      <img
        src={asset.variants.fallback.url}
        width={asset.variants.mobile.width}
        height={asset.variants.mobile.height}
        alt=""
        draggable={false}
        decoding="async"
        onError={() => {
          if (!fallback) setFallback(true);
          else onFailure?.();
        }}
      />
    </picture>
  );
}
