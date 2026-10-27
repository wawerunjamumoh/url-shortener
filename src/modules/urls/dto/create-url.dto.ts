import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateUrlDto {
    @IsNotEmpty()
    @IsUrl()
    longUrl: string;
}
