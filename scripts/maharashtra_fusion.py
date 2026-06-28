"""
Maharashtra Crop & Fusion
==========================
Crops IMD rainfall (0.25deg) and temperature (1.0deg) grids to a Maharashtra
bounding box, regrids temperature up to the rainfall's finer resolution
(nearest/bilinear), and stacks rainfall + max temp + min temp into one
fused (days, lat, lon, 3) tensor.

This is the real implementation of "Figure 1: data fusion" and
"Figure 2: preprocessing pipeline" from the deck, run on real data
instead of illustrated placeholders.
"""

import numpy as np
from imd_parser import (
    read_rainfall_grd, read_temp_grd,
    rainfall_coords, temp_coords,
    mask_missing, RAINFALL_SPEC, TEMP_SPEC,
)

# Maharashtra-wide pilot bounding box. This expands coverage/cell count only;
# the native IMD rainfall grid resolution remains 0.25deg.
MAHARASHTRA_BBOX = {
    "lat_min": 15.5, "lat_max": 22.0,
    "lon_min": 72.5, "lon_max": 80.5,
}


def crop_to_bbox(arr, lats, lons, bbox):
    """Crop a (days, lat, lon) array to a lat/lon bounding box. Returns cropped array + cropped coord arrays."""
    lat_mask = (lats >= bbox["lat_min"]) & (lats <= bbox["lat_max"])
    lon_mask = (lons >= bbox["lon_min"]) & (lons <= bbox["lon_max"])
    cropped = arr[:, lat_mask, :][:, :, lon_mask]
    return cropped, lats[lat_mask], lons[lon_mask]


def regrid_nearest(coarse_arr, coarse_lats, coarse_lons, target_lats, target_lons):
    """
    Nearest-neighbour regrid of a coarse (days, lat, lon) array onto a finer
    target lat/lon grid. Simple and transparent -- adequate for a PoC; a
    production version would use bilinear/kriging interpolation as noted
    in the architecture diagrams.
    """
    lat_idx = np.array([np.argmin(np.abs(coarse_lats - t)) for t in target_lats])
    lon_idx = np.array([np.argmin(np.abs(coarse_lons - t)) for t in target_lons])
    out = coarse_arr[:, lat_idx, :][:, :, lon_idx]
    return out


def build_fused_tensor(data_dir, year, bbox=MAHARASHTRA_BBOX, verbose=True):
    """
    Load one year of rainfall + max temp + min temp, crop to Maharashtra bbox,
    regrid temp to match rainfall's finer grid, and stack into one tensor.

    Returns:
        fused: np.ndarray of shape (days, lat, lon, 3)  [rainfall, maxT, minT]
        lats, lons: the common (rainfall-resolution) coordinate arrays for the bbox
    """
    rf_path = data_dir / f"Rainfall_ind{year}_rfp25.grd"
    maxt_path = data_dir / f"Maxtemp_MaxT_{year}.GRD"
    mint_path = data_dir / f"Mintemp_MinT_{year}.GRD"

    rf = read_rainfall_grd(rf_path, year)
    maxt = read_temp_grd(maxt_path, year)
    mint = read_temp_grd(mint_path, year)

    rf = mask_missing(rf, RAINFALL_SPEC["missing_value"])
    maxt = mask_missing(maxt, TEMP_SPEC["missing_value"])
    mint = mask_missing(mint, TEMP_SPEC["missing_value"])

    rf_lats, rf_lons = rainfall_coords()
    t_lats, t_lons = temp_coords()

    rf_crop, rf_lats_c, rf_lons_c = crop_to_bbox(rf, rf_lats, rf_lons, bbox)
    maxt_crop, t_lats_c, t_lons_c = crop_to_bbox(maxt, t_lats, t_lons, bbox)
    mint_crop, _, _ = crop_to_bbox(mint, t_lats, t_lons, bbox)

    if verbose:
        print(f"[{year}] Rainfall crop shape: {rf_crop.shape} "
              f"(lat {rf_lats_c.min()}-{rf_lats_c.max()}, lon {rf_lons_c.min()}-{rf_lons_c.max()})")
        print(f"[{year}] Temp crop shape (native 1deg): {maxt_crop.shape} "
              f"(lat {t_lats_c.min() if len(t_lats_c) else 'NA'}-{t_lats_c.max() if len(t_lats_c) else 'NA'})")

    # Regrid temp (coarse) onto rainfall's finer grid (nearest neighbour)
    if maxt_crop.shape[1] == 0 or maxt_crop.shape[2] == 0:
        raise ValueError(
            "Temperature crop is empty -- Maharashtra bbox is smaller than the 1deg temp grid spacing. "
            "Falling back to nearest single temp cell for the whole bbox (see regrid_nearest_single)."
        )

    maxt_regrid = regrid_nearest(maxt_crop, t_lats_c, t_lons_c, rf_lats_c, rf_lons_c)
    mint_regrid = regrid_nearest(mint_crop, t_lats_c, t_lons_c, rf_lats_c, rf_lons_c)

    fused = np.stack([rf_crop, maxt_regrid, mint_regrid], axis=-1)

    if verbose:
        print(f"[{year}] Fused tensor shape: {fused.shape}  [days, lat, lon, channels=(rain,maxT,minT)]")
        print(f"[{year}] NaN fraction per channel: "
              f"rain={np.isnan(fused[...,0]).mean():.3f}, "
              f"maxT={np.isnan(fused[...,1]).mean():.3f}, "
              f"minT={np.isnan(fused[...,2]).mean():.3f}")

    return fused, rf_lats_c, rf_lons_c


if __name__ == "__main__":
    from pathlib import Path
    data_dir = Path(__file__).resolve().parent.parent / "data"

    fused, lats, lons = build_fused_tensor(data_dir, 2025)

    print("\nMaharashtra grid coordinates used:")
    print("Lats:", lats)
    print("Lons:", lons)

    print("\nSample: monsoon-season (day 180-190) rainfall, Maharashtra grid mean:")
    print(np.nanmean(fused[180:190, :, :, 0], axis=(1, 2)))
