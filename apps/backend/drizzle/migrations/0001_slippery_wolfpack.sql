CREATE TABLE "Ids" (
	"roomId" text PRIMARY KEY NOT NULL,
	"gameId" text
);
--> statement-breakpoint
ALTER TABLE "Ids" ADD CONSTRAINT "Ids_roomId_Room_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."Room"("id") ON DELETE cascade ON UPDATE no action;