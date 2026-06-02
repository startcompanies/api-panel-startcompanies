import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../../shared/user/entities/user.entity';
import type { AccountTeamPermissions } from '../account-team-permissions';

@Entity('account_team_members')
@Index(['ownerUserId', 'memberUserId'], { unique: true })
@Index(['memberUserId'], { unique: true })
export class AccountTeamMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'owner_user_id', type: 'int' })
  ownerUserId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id' })
  owner?: User;

  @Column({ name: 'member_user_id', type: 'int' })
  memberUserId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_user_id' })
  member?: User;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'revoked';

  @Column({ type: 'jsonb' })
  permissions: AccountTeamPermissions;

  @Column({ name: 'invited_by_user_id', type: 'int', nullable: true })
  invitedByUserId: number | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
