export type MoscowWeather = {
  temp: number;
  feelsLike: number;
  wind: number;
  precipitation: number;
  code: number;
  message: string;
};

type OpenMeteoCurrent = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
};

export async function getMoscowWeather(): Promise<MoscowWeather | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", "55.7558");
    url.searchParams.set("longitude", "37.6173");
    url.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code",
    );
    url.searchParams.set("timezone", "Europe/Moscow");

    const res = await fetch(url, {
      next: { revalidate: 60 * 15 },
      signal: AbortSignal.timeout(900),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoCurrent;
    const current = data.current;
    if (!current || typeof current.temperature_2m !== "number") return null;

    const temp = Math.round(current.temperature_2m);
    const feelsLike = Math.round(current.apparent_temperature ?? temp);
    const wind = Math.round(current.wind_speed_10m ?? 0);
    const precipitation = current.precipitation ?? 0;
    const code = current.weather_code ?? 0;

    return {
      temp,
      feelsLike,
      wind,
      precipitation,
      code,
      message: weatherMessage({ temp, feelsLike, wind, precipitation, code }),
    };
  } catch {
    return null;
  }
}

function weatherMessage({
  temp,
  feelsLike,
  wind,
  precipitation,
  code,
}: {
  temp: number;
  feelsLike: number;
  wind: number;
  precipitation: number;
  code: number;
}) {
  const wet = precipitation > 0 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  const snowy = code >= 71 && code <= 77;
  const windy = wind >= 18;
  const cold = feelsLike <= 8;

  if (snowy) {
    return `В Москве ${temp}°, ощущается как ${feelsLike}°. Снег, лучше взять тёплую обувь и не спешить после занятия.`;
  }
  if (wet && windy) {
    return `В Москве ${temp}°, ветер ${wind} км/ч и возможна сырость. На офлайн занятие лучше взять слой потеплее.`;
  }
  if (wet) {
    return `В Москве ${temp}° и есть осадки. Захватите зонт или верхний слой, чтобы после занятия не продуло.`;
  }
  if (cold || windy) {
    return `В Москве ${temp}°, ощущается как ${feelsLike}°. После офлайн занятия лучше одеться теплее.`;
  }
  if (temp >= 24) {
    return `В Москве ${temp}° и тепло. Возьмите воду и лёгкое настроение на занятие.`;
  }
  return `В Москве ${temp}°, ощущается как ${feelsLike}°. Хорошего занятия и мягкого дня.`;
}
