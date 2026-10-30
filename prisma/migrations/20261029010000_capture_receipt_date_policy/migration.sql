-- Add the trip date from an explicit receipt without enabling any automation.
ALTER TABLE "capture_automations" DROP CONSTRAINT "capture_automations_datePolicy_check";
ALTER TABLE "capture_automations" ADD CONSTRAINT "capture_automations_datePolicy_check"
CHECK ("datePolicy" IN ('BANK_OPERATION', 'NOTIFICATION_POSTED_AT', 'RECEIPT_OPERATION'));
