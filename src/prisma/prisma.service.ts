import { Injectable, OnModuleInit, NotFoundException, Logger } from "@nestjs/common";
import {
	InstanceState,
	PrismaClient,
	User,
	Instance,
	Prisma,
} from "@prisma/client";
import { UserCreateData, UserUpdateData } from "../types";

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit {
	private readonly logger = new Logger(PrismaService.name);
	async onModuleInit() {
		await this.$connect();
	}

	async createUser(data: UserCreateData): Promise<User> {
		return this.user.upsert({
			where: {id: data.id},
			update: {...data},
			create: {...data},
		});
	}

	async findUser(identifier: string): Promise<User | null> {
		return this.user.findUnique({
			where: {id: identifier},
		});
	}

	async updateUser(
		identifier: string,
		data: UserUpdateData,
	): Promise<User> {
		return this.user.update({
			where: {id: identifier},
			data,
		});
	}

	async getUserWithTokens(userId: string): Promise<User | null> {
		return this.user.findUnique({
			where: {id: userId},
		});
	}

	async updateUserTokens(
		userId: string,
		accessToken: string,
		refreshToken: string,
		tokenExpiresAt: Date,
	): Promise<User> {
		return this.user.update({
			where: {id: userId},
			data: {accessToken, refreshToken, tokenExpiresAt},
		});
	}

	async createInstance(instanceData: {
		instanceName: string;
		evolutionApiUrl: string;
		evolutionApiKey: string;
		userId: string;
		stateInstance?: InstanceState | null;
		settings?: Record<string, unknown>;
		name?: string;
	}): Promise<Instance> {
		const { instanceName, evolutionApiUrl, evolutionApiKey, userId, stateInstance, settings, name } = instanceData;

		const userExists = await this.user.findUnique({where: {id: userId}});
		if (!userExists) {
			throw new NotFoundException(`User (GHL Location) with ID ${userId} not found. Cannot create instance.`);
		}

		const existingInstance = await this.instance.findUnique({
			where: {instanceName},
		});

		if (existingInstance) {
			throw new Error(`Instance with name ${instanceName} already exists.`);
		}

		return this.instance.create({
			data: {
				instanceName,
				evolutionApiUrl,
				evolutionApiKey,
				stateInstance: stateInstance || null,
				settings: settings || {},
				name: name || instanceName,
				user: {
					connect: {id: userId},
				},
			},
		});
	}

	async getInstance(id: number | bigint): Promise<(Instance & { user: User }) | null> {
		return this.instance.findUnique({
			where: {id: BigInt(id)},
			include: {user: true},
		});
	}

	async getInstanceByName(instanceName: string): Promise<(Instance & { user: User }) | null> {
		return this.instance.findFirst({
			where: { instanceName },
			include: { user: true },
		});
	}

	async getInstancesByUserId(userId: string): Promise<Instance[]> {
		return this.instance.findMany({
			where: {userId},
			orderBy: {createdAt: "desc"},
		});
	}

	async removeInstance(id: number | bigint): Promise<Instance> {
		return this.instance.delete({
			where: {id: BigInt(id)},
		});
	}

	async updateInstanceSettings(id: number | bigint, settings: Record<string, unknown>): Promise<Instance> {
		return this.instance.update({
			where: {id: BigInt(id)},
			data: {settings: settings || {}},
		});
	}

	async updateInstanceState(id: number | bigint, state: InstanceState): Promise<Instance> {
		return this.instance.update({
			where: {id: BigInt(id)},
			data: {stateInstance: state},
		});
	}

	async updateInstanceName(id: number | bigint, name: string): Promise<Instance & { user: User }> {
		return this.instance.update({
			where: {id: BigInt(id)},
			data: {name},
			include: {user: true},
		});
	}
}
