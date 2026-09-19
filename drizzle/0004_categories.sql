CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);
--> statement-breakpoint
-- Starting categories. A household can rename or delete any of them; these
-- exist so the dropdown is useful on day one rather than empty.
INSERT OR IGNORE INTO `categories` (`id`, `name`, `sort_order`, `created_at`, `updated_at`) VALUES (lower(hex(randomblob(8))), 'Rent', 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint
INSERT OR IGNORE INTO `categories` (`id`, `name`, `sort_order`, `created_at`, `updated_at`) VALUES (lower(hex(randomblob(8))), 'Utilities', 10, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint
INSERT OR IGNORE INTO `categories` (`id`, `name`, `sort_order`, `created_at`, `updated_at`) VALUES (lower(hex(randomblob(8))), 'Internet', 20, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint
INSERT OR IGNORE INTO `categories` (`id`, `name`, `sort_order`, `created_at`, `updated_at`) VALUES (lower(hex(randomblob(8))), 'Groceries', 30, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint
INSERT OR IGNORE INTO `categories` (`id`, `name`, `sort_order`, `created_at`, `updated_at`) VALUES (lower(hex(randomblob(8))), 'Household', 40, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint
INSERT OR IGNORE INTO `categories` (`id`, `name`, `sort_order`, `created_at`, `updated_at`) VALUES (lower(hex(randomblob(8))), 'Other', 50, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint
-- Carry across anything already typed into a bill, so an existing
-- household does not lose the categories it has been using.
INSERT OR IGNORE INTO `categories` (`id`, `name`, `sort_order`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(8))), TRIM(`category`), 100,
       CAST(strftime('%s','now') AS INTEGER) * 1000,
       CAST(strftime('%s','now') AS INTEGER) * 1000
FROM `bills`
WHERE `category` IS NOT NULL AND TRIM(`category`) <> ''
GROUP BY TRIM(`category`);
