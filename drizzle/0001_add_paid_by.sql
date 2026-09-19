ALTER TABLE `bills` ADD `paid_by` text REFERENCES users(id);
--> statement-breakpoint
-- Bills written before this column existed had no recorded payer. The
-- person who entered the bill is the best available answer, and was the
-- implicit assumption at the time.
UPDATE `bills` SET `paid_by` = `created_by` WHERE `paid_by` IS NULL;
