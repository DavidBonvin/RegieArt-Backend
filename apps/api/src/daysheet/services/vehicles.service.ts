import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberRole } from '@regieart/types';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { AddPassengerDto } from '../dto/add-passenger.dto';
import { CreatePickupPointDto } from '../dto/create-pickup-point.dto';
import { UpdatePickupPointDto } from '../dto/update-pickup-point.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Vehículos ────────────────────────────────────────────────

  async createVehicle(userId: string, eventId: string, dto: CreateVehicleDto) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);

    return this.prisma.eventVehicle.create({
      data: { eventId, ...dto },
      include: { passengers: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } }, pickups: { orderBy: { order: 'asc' } } },
    });
  }

  async findVehicles(userId: string, eventId: string) {
    const event = await this.getEventOrFail(eventId);
    await this.requireMembership(userId, event.orgId);

    return this.prisma.eventVehicle.findMany({
      where: { eventId },
      include: {
        passengers: {
          include: {
            user: { select: { id: true, displayName: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        pickups: { orderBy: { order: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateVehicle(userId: string, eventId: string, vehicleId: string, dto: UpdateVehicleDto) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);
    await this.getVehicleOrFail(vehicleId, eventId);

    return this.prisma.eventVehicle.update({
      where: { id: vehicleId },
      data: dto,
      include: { passengers: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } }, pickups: { orderBy: { order: 'asc' } } },
    });
  }

  async deleteVehicle(userId: string, eventId: string, vehicleId: string) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);
    await this.getVehicleOrFail(vehicleId, eventId);

    await this.prisma.eventVehicle.delete({ where: { id: vehicleId } });
    return { message: 'Vehicle deleted' };
  }

  // ─── Pasajeros ────────────────────────────────────────────────

  async addPassenger(userId: string, eventId: string, vehicleId: string, dto: AddPassengerDto) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);
    await this.getVehicleOrFail(vehicleId, eventId);

    // El pasajero debe ser miembro de la organización
    const isMember = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: dto.userId, organizationId: event.orgId } },
    });
    if (!isMember) throw new ForbiddenException('Target user is not a member of this organization');

    const existing = await this.prisma.vehiclePassenger.findUnique({
      where: { vehicleId_userId: { vehicleId, userId: dto.userId } },
    });
    if (existing) throw new ConflictException('User is already a passenger in this vehicle');

    return this.prisma.vehiclePassenger.create({
      data: { vehicleId, userId: dto.userId },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
  }

  async removePassenger(userId: string, eventId: string, vehicleId: string, passengerId: string) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);
    await this.getVehicleOrFail(vehicleId, eventId);

    const passenger = await this.prisma.vehiclePassenger.findFirst({
      where: { vehicleId, userId: passengerId },
    });
    if (!passenger) throw new NotFoundException('Passenger not found in this vehicle');

    await this.prisma.vehiclePassenger.delete({ where: { id: passenger.id } });
    return { message: 'Passenger removed' };
  }

  // ─── Puntos de recogida ───────────────────────────────────────

  async addPickupPoint(userId: string, eventId: string, vehicleId: string, dto: CreatePickupPointDto) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);
    await this.getVehicleOrFail(vehicleId, eventId);

    return this.prisma.vehiclePickupPoint.create({
      data: {
        vehicleId,
        time:    new Date(dto.time),
        address: dto.address,
        lat:     dto.lat,
        lng:     dto.lng,
        order:   dto.order ?? 0,
        notes:   dto.notes,
      },
    });
  }

  async updatePickupPoint(
    userId: string,
    eventId: string,
    vehicleId: string,
    pickupId: string,
    dto: UpdatePickupPointDto,
  ) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);
    await this.getVehicleOrFail(vehicleId, eventId);
    await this.getPickupOrFail(pickupId, vehicleId);

    const data: any = { ...dto };
    if (dto.time) data.time = new Date(dto.time);

    return this.prisma.vehiclePickupPoint.update({ where: { id: pickupId }, data });
  }

  async deletePickupPoint(userId: string, eventId: string, vehicleId: string, pickupId: string) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);
    await this.getVehicleOrFail(vehicleId, eventId);
    await this.getPickupOrFail(pickupId, vehicleId);

    await this.prisma.vehiclePickupPoint.delete({ where: { id: pickupId } });
    return { message: 'Pickup point deleted' };
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private async getEventOrFail(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true, orgId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async getVehicleOrFail(vehicleId: string, eventId: string) {
    const v = await this.prisma.eventVehicle.findFirst({ where: { id: vehicleId, eventId } });
    if (!v) throw new NotFoundException('Vehicle not found');
    return v;
  }

  private async getPickupOrFail(pickupId: string, vehicleId: string) {
    const p = await this.prisma.vehiclePickupPoint.findFirst({ where: { id: pickupId, vehicleId } });
    if (!p) throw new NotFoundException('Pickup point not found');
    return p;
  }

  private async requireMembership(userId: string, orgId: string) {
    const m = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!m) throw new ForbiddenException('You are not a member of this organization');
    return m;
  }

  private async requireAdminOrOwner(userId: string, orgId: string) {
    const m = await this.requireMembership(userId, orgId);
    if (m.role !== MemberRole.OWNER && m.role !== MemberRole.ADMIN) {
      throw new ForbiddenException('Admin or Owner role required');
    }
  }
}
