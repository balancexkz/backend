import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1772034080305 implements MigrationInterface {
    name = 'Init1772034080305'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "pro_positions" ("id" SERIAL NOT NULL, "owner_pubkey" character varying NOT NULL, "pool_id" character varying NOT NULL, "position_nft_mint" character varying, "tick_lower" integer, "tick_upper" integer, "price_range_percent" numeric(10,4) NOT NULL DEFAULT '5', "monitoring_enabled" boolean NOT NULL DEFAULT true, "rebalance_count" integer NOT NULL DEFAULT '0', "last_error" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d8368ab2aad2393057efcb8d8d0" UNIQUE ("owner_pubkey"), CONSTRAINT "PK_7c0298cd4403ec89687cb7a7127" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."liquidity_transactions_role_enum" AS ENUM('vault', 'pro')`);
        await queryRunner.query(`CREATE TYPE "public"."liquidity_transactions_type_enum" AS ENUM('open_position', 'close_position', 'swap', 'collect_fees')`);
        await queryRunner.query(`CREATE TABLE "liquidity_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "role" "public"."liquidity_transactions_role_enum" NOT NULL, "user_id" integer, "owner_pubkey" character varying, "type" "public"."liquidity_transactions_type_enum" NOT NULL, "tx_hash" character varying NOT NULL, "pool_id" character varying NOT NULL, "position_nft_mint" character varying, "sol_amount" numeric(18,9) NOT NULL DEFAULT '0', "usdc_amount" numeric(18,6) NOT NULL DEFAULT '0', "sol_amount_raw" bigint, "usdc_amount_raw" bigint, "sol_amount_usd" numeric(18,2) NOT NULL DEFAULT '0', "usdc_amount_usd" numeric(18,2) NOT NULL DEFAULT '0', "total_value_usd" numeric(18,2) NOT NULL DEFAULT '0', "sol_price" numeric(18,2) NOT NULL DEFAULT '0', "wallet_balance_usd" numeric(18,2), "profit_usd" numeric(18,2), "rebalance_id" character varying, "swap_direction" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_73d92f5ae8d0d10e95d7f954b9c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bcb10968a413fc4a588d76af9b" ON "liquidity_transactions" ("owner_pubkey") `);
        await queryRunner.query(`CREATE INDEX "IDX_acf2b7c6fd4344b5eec9430900" ON "liquidity_transactions" ("tx_hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_e4783446e4d062b585d68f3c9b" ON "liquidity_transactions" ("rebalance_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_42eef2e199a8b4e96cf0aaa42c" ON "liquidity_transactions" ("position_nft_mint") `);
        await queryRunner.query(`CREATE INDEX "IDX_992c2cf4b93db5622462a00d46" ON "liquidity_transactions" ("owner_pubkey", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_ae5e86019b579683111cfe7d6e" ON "liquidity_transactions" ("user_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_0aaa66079a29aa6947afa4dd66" ON "liquidity_transactions" ("role", "created_at") `);
        await queryRunner.query(`ALTER TABLE "user" ADD "wallet_pubkey" character varying`);
        await queryRunner.query(`ALTER TABLE "user" ADD CONSTRAINT "UQ_1e1c695f8698eab49b672db8615" UNIQUE ("wallet_pubkey")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "UQ_1e1c695f8698eab49b672db8615"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "wallet_pubkey"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0aaa66079a29aa6947afa4dd66"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ae5e86019b579683111cfe7d6e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_992c2cf4b93db5622462a00d46"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_42eef2e199a8b4e96cf0aaa42c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e4783446e4d062b585d68f3c9b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_acf2b7c6fd4344b5eec9430900"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bcb10968a413fc4a588d76af9b"`);
        await queryRunner.query(`DROP TABLE "liquidity_transactions"`);
        await queryRunner.query(`DROP TYPE "public"."liquidity_transactions_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."liquidity_transactions_role_enum"`);
        await queryRunner.query(`DROP TABLE "pro_positions"`);
    }

}
