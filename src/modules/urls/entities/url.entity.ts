import { IsUrl } from 'class-validator';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Url {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    shortCode: string;

    @Column({ unique: true })
    @IsUrl()
    longUrl: string;

    @CreateDateColumn()
    createdAt: Date;
}
