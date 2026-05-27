import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    displayName: 'Test User',
  };

  const mockAuthenticatedUser = {
    id: 'user-id',
    keycloakId: 'kc-id',
    email: 'test@example.com',
    displayName: 'Test User',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            getProfile: jest.fn().mockResolvedValue(mockUser),
            updateProfile: jest.fn().mockResolvedValue(mockUser),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile', () => {
    it('should call usersService.getProfile with current user id', async () => {
      const result = await controller.getProfile(mockAuthenticatedUser);
      expect(service.getProfile).toHaveBeenCalledWith('user-id');
      expect(result).toEqual(mockUser);
    });
  });

  describe('updateProfile', () => {
    it('should call usersService.updateProfile with dto', async () => {
      const dto = { displayName: 'New Name' };
      const result = await controller.updateProfile(mockAuthenticatedUser, dto);
      expect(service.updateProfile).toHaveBeenCalledWith('user-id', dto);
      expect(result).toEqual(mockUser);
    });
  });
});
