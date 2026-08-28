import { Global, Module } from "@nestjs/common";
import { Config } from "@prisma/client";
import { ClamScanModule } from "src/clamscan/clamscan.module";
import { EmailModule } from "src/email/email.module";
import { PrismaService } from "src/prisma/prisma.service";
import { ConfigController } from "./config.controller";
import { ConfigService } from "./config.service";

@Global()
@Module({
  imports: [EmailModule, ClamScanModule],
  providers: [
    {
      provide: "CONFIG_VARIABLES",
      useFactory: async (prisma: PrismaService) => {
        return await prisma.config.findMany();
      },
      inject: [PrismaService],
    },
    {
      provide: ConfigService,
      useFactory: async (prisma: PrismaService, configVariables: Config[]) => {
        const configService = new ConfigService(configVariables, prisma);
        await configService.initialize();
        return configService;
      },
      inject: [PrismaService, "CONFIG_VARIABLES"],
    },
  ],
  controllers: [ConfigController],
  exports: [ConfigService],
})
export class ConfigModule {}
