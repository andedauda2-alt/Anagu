import { Coordinate, Parcel } from '../types';

const STORAGE_KEY = 'ANAGU_CADASTRE_PARCELS_V1';
const SETTINGS_KEY = 'ANAGU_SETTINGS_V1';

export class StorageEngine {
  /**
   * Saves parcels to persistent localStorage
   */
  public static saveParcels(parcels: Parcel[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parcels));
    } catch (err) {
      console.warn('Failed to save parcels to localStorage:', err);
    }
  }

  /**
   * Loads saved parcels from localStorage, or null if none
   */
  public static loadParcels(): Parcel[] | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (err) {
      console.warn('Failed to load parcels from localStorage:', err);
    }
    return null;
  }

  /**
   * Clears saved parcels and resets to original default cadastre
   */
  public static resetStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to reset storage:', err);
    }
  }

  /**
   * Exports real GeoJSON (RFC 7946) FeatureCollection for QGIS / ArcGIS / Google Earth
   */
  public static exportToGeoJSON(parcels: Parcel[]): string {
    const features = parcels.map(p => {
      // GeoJSON expects coordinates in [lng, lat]
      const closedCoords = [...p.coordinates];
      if (
        closedCoords.length > 0 &&
        (closedCoords[0][0] !== closedCoords[closedCoords.length - 1][0] ||
          closedCoords[0][1] !== closedCoords[closedCoords.length - 1][1])
      ) {
        closedCoords.push(closedCoords[0]);
      }

      return {
        type: 'Feature' as const,
        id: p.id,
        properties: {
          titleNumber: p.titleNumber,
          applicantName: p.applicantName,
          applicantIdNumber: p.applicantIdNumber,
          applicantWalletAddress: p.applicantWalletAddress,
          locationName: p.locationName,
          lga: p.lga,
          state: p.state,
          landUse: p.landUse,
          areaSqm: p.areaSqm,
          perimeterMeters: p.perimeterMeters,
          spatialHash: p.spatialHash,
          documentHash: p.documentHash,
          deedReference: p.deedReference,
          customaryClan: p.customaryClan,
          status: p.status,
          nftTokenId: p.nftTokenId,
          blockchainTxHash: p.blockchainTxHash,
          isRevoked: p.isRevoked || false,
          revocationGround: p.revocationData?.ground || null,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [closedCoords],
        },
      };
    });

    const featureCollection = {
      type: 'FeatureCollection',
      name: 'Anagu_National_Cadastre_Export',
      crs: {
        type: 'name',
        properties: {
          name: 'urn:ogc:def:crs:OGC:1.3:CRS84',
        },
      },
      features,
    };

    return JSON.stringify(featureCollection, null, 2);
  }

  /**
   * Downloads a text file (GeoJSON, JSON) directly to user's computer
   */
  public static triggerDownload(content: string, filename: string, mimeType = 'application/json'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Parses GeoJSON imported by user and extracts parcels
   */
  public static parseGeoJSONImport(jsonString: string): Partial<Parcel>[] {
    const data = JSON.parse(jsonString);
    const results: Partial<Parcel>[] = [];

    const features = data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [];

    for (const feat of features) {
      if (feat.geometry && feat.geometry.type === 'Polygon' && Array.isArray(feat.geometry.coordinates[0])) {
        const ring = feat.geometry.coordinates[0] as Coordinate[];
        const props = feat.properties || {};

        results.push({
          applicantName: props.applicantName || props.owner || 'Imported Cadastral Parcel',
          applicantIdNumber: props.applicantIdNumber || props.nin || 'NIN-SURVEY-IMPORT',
          locationName: props.locationName || props.location || 'Surveyed Sector',
          lga: props.lga || 'Cadastral District',
          state: props.state || 'FCT',
          landUse: props.landUse || 'Residential',
          coordinates: ring,
          deedReference: props.deedReference || `DEED-IMP-${Date.now().toString().slice(-4)}`,
          customaryClan: props.customaryClan || 'Gbagyi Indigenous Council',
        });
      }
    }

    return results;
  }
}
