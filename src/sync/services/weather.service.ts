import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class WeatherService {
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://api.openweathermap.org/data/3.0/onecall';

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 30000,
    });
  }

  async getWeatherAtTimestamp(
    lat: number,
    lon: number,
    timestamp: string,
  ): Promise<any> {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENWEATHER_API_KEY is not set in environment variables',
      );
    }

    try {
      // Convert timestamp to Unix timestamp
      const unixTimestamp = Math.floor(new Date(timestamp).getTime() / 1000);

      // Use OneCall API 3.0 with historical data (timemachine endpoint)
      // Endpoint: https://api.openweathermap.org/data/3.0/onecall/timemachine?lat={lat}&lon={lon}&dt={time}&appid={API key}
      const url = `${this.baseUrl}/timemachine`;
      const response = await this.axiosInstance.get(url, {
        params: {
          lat,
          lon,
          dt: unixTimestamp,
          appid: apiKey,
          units: 'metric',
        },
      });

      // OneCall API 3.0 timemachine returns data in a 'data' array
      // The first element corresponds to the requested timestamp
      if (
        response.data &&
        response.data.data &&
        response.data.data.length > 0
      ) {
        const weatherData = response.data.data[0];
        return {
          temperature: weatherData.temp,
          feelsLike: weatherData.feels_like,
          humidity: weatherData.humidity,
          pressure: weatherData.pressure,
          visibility: weatherData.visibility
            ? weatherData.visibility / 1000
            : undefined, // Convert to km
          windSpeed: weatherData.wind_speed,
          windDirection: weatherData.wind_deg,
          clouds: weatherData.clouds,
          weather:
            weatherData.weather && weatherData.weather[0]
              ? weatherData.weather[0].main
              : undefined,
          weatherDescription:
            weatherData.weather && weatherData.weather[0]
              ? weatherData.weather[0].description
              : undefined,
          weatherIcon:
            weatherData.weather && weatherData.weather[0]
              ? weatherData.weather[0].icon
              : undefined,
          lat,
          lon,
          timestamp,
        };
      }

      return null;
    } catch (error) {
      console.error(
        `Error fetching weather for lat ${lat}, lon ${lon}, timestamp ${timestamp}:`,
        error.response?.data || error.message,
      );
      // Return null instead of throwing to allow the sync to continue
      return null;
    }
  }
}
