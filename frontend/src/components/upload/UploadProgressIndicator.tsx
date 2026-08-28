import { useEffect, useRef, useState } from "react";
import { RingProgress, Text, useMantineTheme } from "@mantine/core";
import { TbCircleCheck, TbAlertCircle } from "react-icons/tb";
import { HoverTip } from "../core/HoverTip";
import { useIntl } from "react-intl";

// Progress style used to be admin-configurable (circle / circle+percentage /
// percentage+time, via appearance.uploadProgressStyle) — now fixed to the
// circle indicator, the only style actually in use.
const UploadProgressIndicator = ({ progress }: { progress: number }) => {
  const intl = useIntl();
  const { primaryColor } = useMantineTheme();
  const startTimeRef = useRef<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (progress <= 0 || progress >= 100) {
      startTimeRef.current = null;
      setRemainingSeconds(null);
      return;
    }

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
      return;
    }

    const elapsedMs = Date.now() - startTimeRef.current;
    if (elapsedMs > 500) {
      const rate = progress / 100;
      const totalMs = elapsedMs / rate;
      const remainingMs = totalMs - elapsedMs;
      setRemainingSeconds(remainingMs / 1000);
    }
  }, [progress]);

  const formatRemainingTime = (seconds: number | null): string => {
    if (seconds === null || !isFinite(seconds) || seconds < 0) {
      return intl.formatMessage({
        id: "upload.filelist.estimating",
      });
    }

    let timeStr = "";
    if (seconds < 60) {
      timeStr = `${Math.round(seconds)}s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      if (minutes < 60) {
        timeStr = `${minutes}m ${remainingSeconds}s`;
      } else {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        timeStr = `${hours}h ${remainingMinutes}m`;
      }
    }

    return intl.formatMessage(
      {
        id: "upload.filelist.remaining",
      },
      { time: timeStr },
    );
  };

  if (progress > 0 && progress < 100) {
    return (
      <HoverTip label={formatRemainingTime(remainingSeconds)}>
        <RingProgress
          sections={[{ value: progress, color: primaryColor }]}
          thickness={3}
          size={25}
        />
      </HoverTip>
    );
  } else if (progress >= 100) {
    return <TbCircleCheck color="green" size={22} />;
  } else {
    // A spinning loader here (the previous treatment) reads as "still
    // working" — this is the opposite: a terminal failure, done retrying on
    // its own, waiting on the retry action FileList renders next to this.
    // A static icon says "stopped" instead of implying more activity is
    // coming with no further feedback if it never does.
    return <TbAlertCircle color="red" size={19} />;
  }
};

export default UploadProgressIndicator;
