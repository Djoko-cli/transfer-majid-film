import { useMantineColorScheme } from "@mantine/core";
import { useEffect, useState } from "react";
import useBrandAsset from "../hooks/brandAsset.hook";

const Logo = ({ height, width }: { height: number; width: number }) => {
  const { colorScheme } = useMantineColorScheme();
  const { asset } = useBrandAsset();
  const defaultLogoSrc = asset("logo.png");
  const preferredLogoSrc =
    colorScheme === "dark" ? asset("logo-dark.png") : defaultLogoSrc;
  const [logoSrc, setLogoSrc] = useState(preferredLogoSrc);

  useEffect(() => {
    setLogoSrc(preferredLogoSrc);
  }, [preferredLogoSrc]);

  return (
    <img
      src={logoSrc}
      alt="logo"
      height={height}
      width={width}
      onError={() => {
        if (logoSrc !== defaultLogoSrc) setLogoSrc(defaultLogoSrc);
      }}
    />
  );
};
export default Logo;
