import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
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
import { EmailService } from "src/email/email.service";
import { CreateReverseShareDTO } from "./dto/createReverseShare.dto";

@Injectable()
export class ReverseShareService {
  private readonly logger = new Logger(ReverseShareService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private fileService: FileService,
    private readonly i18n: I18nService,
    private emailService: EmailService,
  ) {}

  async create(data: CreateReverseShareDTO, creatorId: string) {
    // Only the making of new links is refused. Everything already created
    // keeps working, contributions included — freezing an transfer mid-collection
    // is not what anyone means when they untick a box.
    if (!this.config.get("share.enableReverseShares"))
      throw new ForbiddenException(this.i18n.t("reverseShare.disabled"));

    const collectionEndsAt = parseRelativeDateToAbsolute(data.collectionEndsAt);
    const retentionSeconds = moment
      .duration(
        data.retention.split("-")[0],
        data.retention.split("-")[1] as moment.unitOfTime.DurationConstructor,
      )
      .asSeconds();
    // The date the container actually dies — collectionEndsAt only closes
    // deposits, the transfer lives on for retentionSeconds after that. The cap
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
            // Same line ShareService.create() writes, and for the same
            // reason: FileService.create() routes writes by the global
            // s3.enabled flag while every read resolves by this column.
            // Left to its "LOCAL" default, an S3 instance would write
            // every deposited byte to S3 and then serve it through
            // LocalFileService — a 404 on every download, and an orphaned
            // object on every delete.
            storageProvider: this.config.get("s3.enabled") ? "S3" : "LOCAL",
            // A password and nothing else. A view cap here would apply to
            // the very page every contributor has to open in order to
            // deposit, and that the owner reloads to watch files arrive —
            // see the creation form's own comment. The cap that belongs to
            // this mode counts contributions: remainingUses, below.
            security: hashedPassword
              ? { create: { password: hashedPassword } }
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
            name: data.name || undefined,
            description: data.description || undefined,
            password: hashedPassword,
            creatorId,
          },
        });
      });

      // After the link exists, and deliberately not inside the transaction
      // above: a mail server that is slow, or down, must not roll back a
      // link that was created correctly. Each address is awaited on its own
      // and its failure swallowed, so one bad address does not cost the
      // other invitations — the creator gets the link back either way, and
      // the failure is in the log.
      if (data.recipients?.length) {
        const creator = await this.prisma.user.findUnique({
          where: { id: creatorId },
        });

        for (const recipient of data.recipients) {
          try {
            await this.emailService.sendReverseShareInvite(
              recipient,
              reverseShare.token,
              creator,
              data.name || undefined,
              data.description || undefined,
            );
          } catch (e) {
            this.logger.error(
              `Could not invite ${recipient} to reverse share ${reverseShare.token}`,
              e,
            );
          }
        }
      }

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
        // The transfer's death, not the end of deposits — those are two
        // different dates now, and filtering on the first hides a
        // collection that is closed but entirely alive from the only
        // page that lists it.
        containerShare: { expiration: { gt: new Date() } },
      },
      orderBy: {
        collectionEndsAt: "desc",
      },
      include: {
        containerShare: {
          include: {
            files: { select: { size: true } },
            // Every contribution, open or closed — same policy as
            // ContributionService.getWithFiles(), which the public transfer
            // (ShareController.buildCollectionState) already reads
            // without filtering on completedAt: a contribution row only
            // exists once someone proved an identity, so a still-open one
            // is a real person mid-deposit, not noise.
            contributions: {
              select: { name: true, user: { select: { username: true } } },
            },
          },
        },
      },
    });

    // Assembled here rather than left as a raw Prisma row, so the DTO can
    // simply @Expose() everything it declares — the owner's page wants
    // aggregates (how many people, how much), not the rows behind them.
    return reverseShares.map((reverseShare) => {
      const { containerShare, ...rest } = reverseShare;
      const contributions = containerShare.contributions;

      return {
        ...rest,
        containerExpiresAt: moment(reverseShare.collectionEndsAt)
          .add(reverseShare.retentionSeconds, "seconds")
          .toDate(),
        contributionsCount: contributions.length,
        filesCount: containerShare.files.length,
        totalSize: containerShare.files.reduce(
          (acc, file) => acc + parseInt(file.size),
          0,
        ),
        contributorNames: contributions.map(
          (contribution) =>
            contribution.name ?? contribution.user?.username ?? null,
        ),
      };
    });
  }

  // Only the link row goes: with a container, removing it must not remove
  // the transfer. The `onDelete: Cascade` on containerShare already covers the
  // other direction (deleting the container takes the link with it); this
  // is the one-way street back.
  //
  // The transfer's real death date has to be written here, though, before the
  // row carrying the two clocks disappears. JobsService.closeEndedCollections()
  // computes `collectionEndsAt + retentionSeconds` *from that row*; once it
  // is gone the cron can never select the container again, and it keeps the
  // ten-years-out placeholder written at birth — retentionSeconds silently
  // discarded and the transfer sitting in its owner's quota for a decade.
  // Written in the same transaction as the delete so the two can never come
  // apart.
  async remove(id: string) {
    const reverseShare = await this.prisma.reverseShare.findUnique({
      where: { id },
    });

    if (!reverseShare) {
      // Unreachable through the controller (ReverseShareOwnerGuard has
      // already read the row), kept so this method still fails the way it
      // always did rather than silently succeeding.
      await this.prisma.reverseShare.delete({ where: { id } });
      return;
    }

    await this.prisma.$transaction([
      this.prisma.share.update({
        where: { id: reverseShare.containerShareId },
        data: {
          expiration: moment(reverseShare.collectionEndsAt)
            .add(reverseShare.retentionSeconds, "seconds")
            .toDate(),
        },
      }),
      this.prisma.reverseShare.delete({ where: { id } }),
    ]);
  }
}
