CREATE INDEX "idx_event_logs_upload_id" ON "event_logs" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "idx_event_logs_created_at" ON "event_logs" USING btree ("created_at");