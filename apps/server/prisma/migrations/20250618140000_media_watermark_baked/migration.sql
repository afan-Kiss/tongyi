-- 历史照片已烧录水印；新上传改为展示时动态叠加
ALTER TABLE "MediaAsset" ADD COLUMN "watermarkBaked" BOOLEAN NOT NULL DEFAULT false;
UPDATE "MediaAsset" SET "watermarkBaked" = true WHERE "type" = 'photo';
