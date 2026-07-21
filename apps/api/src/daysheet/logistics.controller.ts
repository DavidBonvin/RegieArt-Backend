import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';
import { VehiclesService } from './services/vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { AddPassengerDto } from './dto/add-passenger.dto';
import { CreatePickupPointDto } from './dto/create-pickup-point.dto';
import { UpdatePickupPointDto } from './dto/update-pickup-point.dto';

@UseGuards(JwtAuthGuard)
@Controller('events')
export class LogisticsController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // ── Vehículos ─────────────────────────────────────────────────

  @Post(':id/vehicles')
  createVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateVehicleDto,
  ) {
    return this.vehiclesService.createVehicle(user.id, id, dto);
  }

  @Get(':id/vehicles')
  getVehicles(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vehiclesService.findVehicles(user.id, id);
  }

  @Patch(':id/vehicles/:vehicleId')
  updateVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.updateVehicle(user.id, id, vehicleId, dto);
  }

  @Delete(':id/vehicles/:vehicleId')
  @HttpCode(HttpStatus.OK)
  deleteVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vehiclesService.deleteVehicle(user.id, id, vehicleId);
  }

  // ── Pasajeros ─────────────────────────────────────────────────

  @Post(':id/vehicles/:vehicleId/passengers')
  addPassenger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: AddPassengerDto,
  ) {
    return this.vehiclesService.addPassenger(user.id, id, vehicleId, dto);
  }

  @Delete(':id/vehicles/:vehicleId/passengers/:passengerId')
  @HttpCode(HttpStatus.OK)
  removePassenger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @Param('passengerId') passengerId: string,
  ) {
    return this.vehiclesService.removePassenger(user.id, id, vehicleId, passengerId);
  }

  // ── Puntos de recogida ────────────────────────────────────────

  @Post(':id/vehicles/:vehicleId/pickups')
  addPickupPoint(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: CreatePickupPointDto,
  ) {
    return this.vehiclesService.addPickupPoint(user.id, id, vehicleId, dto);
  }

  @Patch(':id/vehicles/:vehicleId/pickups/:pickupId')
  updatePickupPoint(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @Param('pickupId') pickupId: string,
    @Body() dto: UpdatePickupPointDto,
  ) {
    return this.vehiclesService.updatePickupPoint(user.id, id, vehicleId, pickupId, dto);
  }

  @Delete(':id/vehicles/:vehicleId/pickups/:pickupId')
  @HttpCode(HttpStatus.OK)
  deletePickupPoint(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @Param('pickupId') pickupId: string,
  ) {
    return this.vehiclesService.deletePickupPoint(user.id, id, vehicleId, pickupId);
  }
}
