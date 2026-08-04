import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MemberRole } from '@regieart/types';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: {
            organization: {
              findUnique: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            organizationMember: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: NotificationsService,
          useValue: { fire: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an organization and assign OWNER role', async () => {
      const dto = { name: 'Test Org' };
      const expectedOrg = { id: 'org-1', name: 'Test Org', slug: 'test-org' };
      
      jest.spyOn(prismaService.organization, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prismaService.organization, 'create').mockResolvedValue(expectedOrg as any);

      const result = await service.create('user-1', dto);
      expect(result).toEqual(expectedOrg);
      expect(prismaService.organization.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Org',
          slug: 'test-org',
          members: {
            create: {
              userId: 'user-1',
              role: MemberRole.OWNER,
            },
          },
        },
      });
    });
  });

  describe('updateMemberRole', () => {
    it('should throw ForbiddenException if user is not OWNER or ADMIN', async () => {
      jest.spyOn(prismaService.organizationMember, 'findUnique').mockResolvedValue({
        role: MemberRole.MEMBER,
      } as any);

      await expect(
        service.updateMemberRole('user-1', 'org-1', 'member-1', { role: MemberRole.ADMIN })
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update role if user is OWNER', async () => {
      jest.spyOn(prismaService.organizationMember, 'findUnique').mockResolvedValue({
        role: MemberRole.OWNER,
      } as any);
      jest.spyOn(prismaService.organizationMember, 'update').mockResolvedValue({
        id: 'member-1',
        role: MemberRole.ADMIN,
        user: { id: 'user-2', displayName: 'Test User' },
        organization: { name: 'Test Org' },
      } as any);

      const result = await service.updateMemberRole('user-1', 'org-1', 'member-1', { role: MemberRole.ADMIN });
      expect(result.role).toBe(MemberRole.ADMIN);
    });
  });
});
