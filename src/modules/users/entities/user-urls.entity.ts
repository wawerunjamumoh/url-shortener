import { Entity,Column } from "typeorm";

@Entity()
export class UserUrls{
    @Column({type: 'uuid'})
    userID: string;

    @Column({type: 'uuid'})
    urlId: string;
}