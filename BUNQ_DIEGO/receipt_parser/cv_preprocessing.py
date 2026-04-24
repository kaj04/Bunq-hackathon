import cv2
import numpy as np

def preprocess_image(image_path, output_path=None):
    """
    Reads an image, deskews it, and boosts contrast while keeping color.
    Returns the preprocessed COLOR image (BGR).
    """
    # 1. Read image in color
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not load image from {image_path}")

    # 2. Create a grayscale copy ONLY for edge/angle detection
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 3. Deskewing: detect angle using edges on the grayscale copy
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 100, minLineLength=100, maxLineGap=10)

    angle = 0.0
    if lines is not None:
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            if x2 - x1 == 0:
                continue
            deg = np.degrees(np.arctan((y2 - y1) / (x2 - x1)))
            if -45 < deg < 45:
                angles.append(deg)
        if angles:
            angle = np.median(angles)

    # 4. Apply rotation to the ORIGINAL COLOR image
    result = img.copy()
    if abs(angle) > 0.5:
        (h, w) = result.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        result = cv2.warpAffine(result, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    # 5. Boost contrast on the color image using CLAHE per channel
    lab = cv2.cvtColor(result, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    lab = cv2.merge([l, a, b])
    result = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    # 6. Save for inspection if requested
    if output_path:
        cv2.imwrite(output_path, result)

    return result

if __name__ == "__main__":
    pass
