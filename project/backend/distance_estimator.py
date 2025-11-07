import numpy as np
import cv2

class DistanceEstimator:
    def __init__(self, camera_params=None):
        # Default camera parameters if not provided
        self.camera_params = camera_params or {
            'focal_length': 1000,  # Approximate focal length in pixels
            'known_width': {
                'person': 0.5,     # Average width of a person in meters
                'dog': 0.4,        # Average width of a dog in meters
                'cow': 0.8         # Average width of a cow in meters
            }
        }
    
    def estimate_distance(self, object_class, bbox_width, frame_width):
        """
        Estimate distance using the apparent size method
        
        Args:
            object_class: Class of the detected object (e.g., 'person', 'dog', 'cow')
            bbox_width: Width of the bounding box in pixels
            frame_width: Width of the frame in pixels
            
        Returns:
            Estimated distance in meters
        """
        # Get the known width for this object class
        if object_class in self.camera_params['known_width']:
            known_width = self.camera_params['known_width'][object_class]
        else:
            # Default to person if class not found
            known_width = self.camera_params['known_width']['person']
        
        # Calculate distance using the formula: distance = (known_width * focal_length) / bbox_width
        distance = (known_width * self.camera_params['focal_length']) / bbox_width
        
        return distance