import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import * as argon from "argon2";
import * as fs from "fs";
import * as moment from "moment";
import { I18nService } from "nestjs-i18n";
import { SHARE_DIRECTORY } from "src/constants";
import { ConfigService } from "src/config/config.service";
import { FileService } from "src/file/file.service";
import { PrismaService } from "src/prisma/prisma.service";
import { parseRelativeDateToAbsolute } from "src/utils/date.util";
import { CreateReverseShareDTO } from "./dto/createReverseShare.dto";

@Injectable()
export class ReverseShareService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private fileService: FileService,
    private readonly i18n: I18nService,
  ) {}

  async create(data: CreateReverseShareDTO, creatorId: string) {
    const collectionEndsAt = parseRelativeDateToAbsolute(data.collectionEndsAt);
    const retentionSeconds = moment
      .duration(
        data.retention.split("-")[0],
        data.retention.split("-")[1] as moment.unitOfTime.DurationConstructor,
      )
      .asSeconds();
    // The date the container actually dies — collectionEndsAt only closes
    // deposits, the album lives on for retentionSeconds after that. The cap
    // below has to bind on this date: checking collectionEndsAt alone would
    // let a short collection window with years of retention sail past it.
    const containerExpiration = moment(collectionEndsAt)
      .add(retentionSeconds, "seconds")
      .toDate();

    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
    });

    const maxExpiration = this.config.get("share.maxExpiration");
    if (
      !creator?.isAdmin &&
      !creator?.canCreatePermanentShares &&
      maxExpiration.value !== 0 &&
      containerExpiration >
        moment().add(maxExpiration.value, maxExpiration.unit).toDate()
    ) {
      throw new BadRequestException(this.i18n.t("share.maxExpirationExceeded"));
    }
    const userMaxShareSize = creator?.shareSizeLimit
      ? parseInt(creator.shareSizeLimit)
      : parseInt(this.config.get("share.maxSize"));

    if (userMaxShareSize < parseInt(data.maxShareSize))
      throw new BadRequestException(
        this.i18n.t("reverseShare.maxShareSizeExceeded", {
          args: { maxSize: userMaxShareSize },
        }),
      );

    // Two namespaces became one the day the container took the token for
    // its id, so both have to be clear. Checking only the token would let
    // a collection be born at the address of an existing transfer.
    if (!(await this.isReverseShareTokenAvailable(data.token)).isAvailable)
      throw new BadRequestException(this.i18n.t("reverseShare.tokenInUse"));
    // Queried here rather than through ShareService: ShareModule already
    // imports ReverseShareModule, so injecting it back would be circular
    // and would need a forwardRef for a single findUnique.
    if (await this.prisma.share.findUnique({ where: { id: data.token } }))
      throw new BadRequestException(this.i18n.t("share.idInUse"));

    // Hashed here, once — ShareService.create() reads this same hash
    // straight into each new share's own security record rather than
    // re-hashing (it isn't the plaintext any more).
    const hashedPassword = data.password
      ? await argon.hash(data.password)
      : undefined;

    // Every other Share gets this directory from ShareService.create()'s
    // own mkdirSync, right before its own row is written. The container is
    // never created through that path, so nothing else will ever make this
    // directory exist — LocalFileService.create() assumes it already does
    // and just appends into it.
    fs.mkdirSync(`${SHARE_DIRECTORY}/${data.token}`, { recursive: true });

    try {
      // The container is born locked, which is what makes it readable at
      // once: an unlocked transfer answers "not found" and a cron deletes it
      // within a day. Its expiration is far off until the collection closes,
      // at which point the cron in JobsService computes the real one.
      const reverseShare = await this.prisma.$transaction(async (tx) => {
        await tx.share.create({
          data: {
            id: data.token,
            name: data.name || undefined,
            description: data.description || undefined,
            isCollection: true,
            uploadLocked: true,
            expiration: moment(collectionEndsAt).add(10, "years").toDate(),
            creatorId,
            security:
              hashedPassword || data.maxViews
                ? {
                    create: {
                      password: hashedPassword,
                      maxViews: data.maxViews || undefined,
                    },
                  }
                : undefined,
          },
        });

        return tx.reverseShare.create({
          data: {
            token: data.token,
            containerShareId: data.token,
            collectionEndsAt,
            retentionSeconds,
            remainingUses: data.maxUseCount,
            maxShareSize: data.maxShareSize,
            sendEmailNotification: data.sendEmailNotification,
            publicAccess: data.publicAccess,
            name: data.name || undefined,
            description: data.description || undefined,
            password: hashedPassword,
            maxViews: data.maxViews || undefined,
            creatorId,
          },
        });
      });

      return reverseShare.token;
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
        throw new BadRequestException(this.i18n.t("reverseShare.tokenInUse"));
      }
      throw e;
    }
  }

  async isReverseShareTokenAvailable(token: string) {
    const reverseShare = await this.prisma.reverseShare.findUnique({
      where: { token },
    });
    return { isAvailable: !reverseShare };
  }

  async getAllByUser(userId: string) {
    const reverseShares = await this.prisma.reverseShare.findMany({
      where: {
        creatorId: userId,
        // The album's death, not the end of deposits — those are two
        // different dates now, and filtering on the first hides a
        // collection that is closed but entirely alive from the only
        // page that lists it.
        containerShare: { expiration: { gt: new Date() } },
      },
      orderBy: {
        collectionEndsAt: "desc",
      },
      include: { containerShare: true },
    });

    return reverseShares;
  }

  // Only the link row goes: with a container, removing it must not remove
  // the album. The `onDelete: Cascade` on containerShare already covers the
  // other direction (deleting the container takes the link with it); this
  // is the one-way street back.
  async remove(id: string) {
    await this.prisma.reverseShare.delete({ where: { id } });
  }
}
