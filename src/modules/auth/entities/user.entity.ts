import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';

@Entity()
@Unique(['email'])
export class User {
    @PrimaryGeneratedColumn('uuid')
    userId: string;

    @Column()
    firstName: string;

    @Column()
    lastName: string;

    @Column()
    email: string;

    @Column({ select: false })
    passwordHash: string;

    @Column({ type: 'varchar', nullable: true, select: false })
    refreshTokenHash: string | null;

    @CreateDateColumn()
    joinedAt: Date;
}