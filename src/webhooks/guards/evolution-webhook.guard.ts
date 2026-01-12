import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class EvolutionWebhookGuard implements CanActivate {
	private readonly logger = new Logger(EvolutionWebhookGuard.name);

	constructor(private readonly prisma: PrismaService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();
		return this.validateRequest(request);
	}

	private async validateRequest(request: Request & { body: Record<string, unknown>; instance?: unknown }): Promise<boolean> {
		const body = request.body;

		// Validate webhook has required fields
		if (!body || typeof body !== "object") {
			this.logger.warn("Invalid webhook payload: body is missing or not an object");
			throw new UnauthorizedException("Invalid webhook payload");
		}

		const { event, instance: instanceName } = body as { event?: string; instance?: string };

		if (!event || typeof event !== "string") {
			this.logger.warn("Invalid webhook payload: missing or invalid 'event' field");
			throw new UnauthorizedException("Invalid webhook payload: missing event field");
		}

		if (!instanceName || typeof instanceName !== "string") {
			this.logger.warn("Invalid webhook payload: missing or invalid 'instance' field");
			throw new UnauthorizedException("Invalid webhook payload: missing instance field");
		}

		// Look up instance by name in database
		const dbInstance = await this.prisma.getInstanceByName(instanceName);

		if (!dbInstance) {
			this.logger.warn(`Instance not found in database: ${instanceName}`);
			throw new UnauthorizedException("Instance not found");
		}

		// Attach instance to request for controller use
		request.instance = dbInstance;

		return true;
	}
}
