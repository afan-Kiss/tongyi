import React, { useState } from 'react'
import type { MediaAsset } from '@/api/types'
import { mediaAssetUrl, mediaThumbUrl } from '@/lib/mediaAsset'

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  asset: MediaAsset
  placeholderClassName?: string
}

/** 缩略图加载失败时自动回退原图，避免库存列表出现裂图 */
export const MediaThumbImg: React.FC<Props> = ({
  asset,
  className,
  placeholderClassName,
  alt = '',
  ...rest
}) => {
  const thumbSrc = mediaThumbUrl(asset)
  const fullSrc = mediaAssetUrl(asset)
  const [src, setSrc] = useState(thumbSrc || fullSrc)
  const [failed, setFailed] = useState(false)

  if (failed || !src) {
    return (
      <div
        className={
          placeholderClassName ||
          'flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-rose-100 bg-rose-50/50 text-[10px] text-slate-400'
        }
      >
        无图
      </div>
    )
  }

  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        if (fullSrc && src !== fullSrc) {
          setSrc(fullSrc)
          return
        }
        setFailed(true)
      }}
    />
  )
}
