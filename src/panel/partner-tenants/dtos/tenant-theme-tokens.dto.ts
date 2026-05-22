import { ApiProperty } from '@nestjs/swagger';

export class TenantThemeTokensDto {
  @ApiProperty({ example: '#0068BD' })
  primary: string;

  @ApiProperty({ example: '#006AFE' })
  secondary: string;

  @ApiProperty({ example: '#01C9E2' })
  accent: string;

  @ApiProperty()
  sidebarBg: string;

  @ApiProperty()
  topbarBg: string;

  @ApiProperty()
  sidebarBorder: string;

  @ApiProperty()
  workspaceBg: string;

  @ApiProperty()
  authGradientFrom: string;

  @ApiProperty()
  authGradientMid: string;

  @ApiProperty()
  authGradientTo: string;

  @ApiProperty()
  authGlow: string;

  @ApiProperty()
  panelBrandPrimary: string;

  @ApiProperty()
  panelBrandCyan: string;
}
