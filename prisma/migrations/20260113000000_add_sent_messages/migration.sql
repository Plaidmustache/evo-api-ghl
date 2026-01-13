-- CreateTable: SentMessage for read receipt tracking
-- Maps GHL messageId <-> Evolution/WhatsApp messageId

CREATE TABLE `SentMessage` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `ghlMessageId` VARCHAR(191) NOT NULL,
    `evolutionMsgId` VARCHAR(100) NOT NULL,
    `instanceId` BIGINT NOT NULL,
    `contactPhone` VARCHAR(50) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SentMessage_ghlMessageId_key`(`ghlMessageId`),
    INDEX `SentMessage_evolutionMsgId_idx`(`evolutionMsgId`),
    INDEX `SentMessage_instanceId_idx`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SentMessage` ADD CONSTRAINT `SentMessage_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
