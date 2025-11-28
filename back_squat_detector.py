import numpy as np


# Dictionary to track state for each prediction (keyed by detection_id or index)
_prediction_states = {}  # {prediction_id: {"state": "...", "counter": 0}}


def calculate_angle(a, b, c):
    """Calculate the angle at point b given three points a, b, c as (x, y) tuples.
    
    Args:
        a: First point (x, y)
        b: Middle point (x, y) - angle is calculated at this point
        c: Third point (x, y)
        
    Returns:
        Angle in degrees
    """
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)
    ba = a - b
    bc = c - b
    # Compute cosine similarity, clip to account for floating point errors
    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-7)
    cosine_angle = np.clip(cosine_angle, -1.0, 1.0)
    angle = np.arccos(cosine_angle)
    return np.degrees(angle)


def get_squat_phase(left_knee_angle):
    """Determine squat phase based on left knee angle.
    
    Args:
        left_knee_angle: Angle in degrees (None if not available)
        
    Returns:
        Phase name: "standing", "half_squat", or "deep_squat"
    """
    if left_knee_angle is None:
        return "unknown"
    
    # Thresholds for squat phases (adjustable)
    # Standing/upright: angle > 170 degrees
    # Half squat: 73 < angle <= 170 degrees
    # Deep squat: angle <= 73 degrees
    if left_knee_angle > 170:
        return "standing"
    elif left_knee_angle > 73:
        return "half_squat"
    else:
        return "deep_squat"


def update_squat_state(prediction_id, phase):
    """Update squat movement state for a specific prediction based on current phase.
    
    State transitions:
    - START -> STANDING (when phase is standing)
    - STANDING -> DESCENDING (when phase is half_squat)
    - DESCENDING -> SQUATTING (when phase is deep_squat)
    - SQUATTING -> ASCENDING (when phase is half_squat)
    - ASCENDING -> STANDING (when phase is standing, increments counter)
    
    Args:
        prediction_id: Unique identifier for the prediction
        phase: Current phase from get_squat_phase
        
    Returns:
        Tuple of (previous_state, current_state, counter)
    """
    global _prediction_states
    
    # Initialize state for this prediction if not exists
    if prediction_id not in _prediction_states:
        _prediction_states[prediction_id] = {
            "state": "START",
            "previous_state": "START",
            "counter": 0
        }
    
    state_info = _prediction_states[prediction_id]
    previous_state = state_info["state"]  # Current state becomes previous
    current_state = state_info["state"]
    counter = state_info["counter"]
    
    if phase == "unknown":
        return (previous_state, current_state, counter)
    
    # State machine transitions
    if current_state == "START":
        if phase == "standing":
            current_state = "STANDING"
    
    elif current_state == "STANDING":
        if phase == "half_squat":
            current_state = "DESCENDING"
    
    elif current_state == "DESCENDING":
        if phase == "deep_squat":
            current_state = "SQUATTING"
    
    elif current_state == "SQUATTING":
        if phase == "half_squat":
            current_state = "ASCENDING"
    
    elif current_state == "ASCENDING":
        if phase == "standing":
            current_state = "STANDING"
            counter += 1
    
    # Update stored state
    state_info["previous_state"] = previous_state
    state_info["state"] = current_state
    state_info["counter"] = counter
    
    return (previous_state, current_state, counter)


def get_prediction_state(prediction_id):
    """Get the current state and counter for a prediction.
    
    Args:
        prediction_id: Unique identifier for the prediction
        
    Returns:
        Dictionary with "state" and "counter", or None if not found
    """
    return _prediction_states.get(prediction_id)


def reset_prediction_state(prediction_id=None):
    """Reset the squat state for a specific prediction or all predictions.
    
    Args:
        prediction_id: Unique identifier for the prediction, or None to reset all
    """
    global _prediction_states
    if prediction_id is None:
        _prediction_states = {}
    elif prediction_id in _prediction_states:
        _prediction_states[prediction_id] = {
            "state": "START",
            "previous_state": "START",
            "counter": 0
        }


def get_state_label(state: str) -> str:
    """Get arrow symbol for each squat state.
    
    Args:
        state: Current squat state
        
    Returns:
        Arrow symbol representing the state
    """
    arrow_map = {
        "START": "Start",
        "STANDING": "Up",
        "DESCENDING": "Dsc",
        "SQUATTING": "Asc",
        "ASCENDING": "Asc"
    }
    return arrow_map.get(state, "Start")


def modify_class_name(class_name: str, left_knee_angle: float = None, prediction_id: str = None) -> str:
    """Modify a class name based on squat movement state.
    
    Args:
        class_name: The original class name (not used in output)
        left_knee_angle: Left knee angle in degrees (None if not available)
        prediction_id: Unique identifier for the prediction
        
    Returns:
        The modified label with arrow, state, and rep count (no class name)
    """
    phase = get_squat_phase(left_knee_angle)
    previous_state, current_state, counter = update_squat_state(prediction_id, phase)
    arrow = get_state_label(current_state)
    return f"{arrow}: Reps {counter}"


def run(self, keypoint_prediction) -> dict:
    """Append movement state suffix to class names based on left knee angle.
    
    Tracks squat movement state machine and counts completed squats per prediction.
    """
    # Get class names and keypoints
    class_names = keypoint_prediction.data.get('class_name')
    keypoints_xy = keypoint_prediction.data.get('keypoints_xy')
    keypoints_class_name = keypoint_prediction.data.get('keypoints_class_name')
    predictions = keypoint_prediction.data.get('predictions', [])
    
    # Sanity check
    if class_names is None or not isinstance(class_names, np.ndarray):
        return {"squat_prediction": keypoint_prediction}
    
    # Calculate left knee angle for each prediction
    left_knee_angles = []
    prediction_ids = []
    num_predictions = len(class_names)
    
    if keypoints_xy is not None and keypoints_class_name is not None:
        for i in range(num_predictions):
            left_knee_angle = None
            prediction_id = None
            
            # Get prediction ID (use detection_id if available, otherwise use index)
            if i < len(predictions) and isinstance(predictions[i], dict):
                prediction_id = predictions[i].get('detection_id', f"prediction_{i}")
            else:
                prediction_id = f"prediction_{i}"
            
            prediction_ids.append(prediction_id)
            
            # Get keypoints for this prediction
            if i < len(keypoints_xy) and i < len(keypoints_class_name):
                kp_xy = keypoints_xy[i]
                kp_names = keypoints_class_name[i]
                
                # Convert to dict for easier access
                keypoints_dict = {}
                for name, (x, y) in zip(kp_names, kp_xy):
                    keypoints_dict[name] = [float(x), float(y)]
                
                # Calculate left knee angle if all required keypoints are present
                if all(k in keypoints_dict for k in ["left_hip", "left_knee", "left_ankle"]):
                    left_knee_angle = calculate_angle(
                        keypoints_dict["left_hip"],
                        keypoints_dict["left_knee"],
                        keypoints_dict["left_ankle"]
                    )
            
            left_knee_angles.append(left_knee_angle)
    else:
        # No keypoints available, use None for all and generate IDs
        left_knee_angles = [None] * num_predictions
        prediction_ids = [f"prediction_{i}" for i in range(num_predictions)]
    
    # Apply modify_class_name to each class name with its corresponding angle and ID
    modified = []
    prediction_states = []
    for class_name, angle, pred_id in zip(class_names, left_knee_angles, prediction_ids):
        modified_name = modify_class_name(str(class_name), angle, pred_id)
        modified.append(modified_name)
        
        # Get state info for this prediction
        state_info = get_prediction_state(pred_id)
        if state_info:
            prediction_states.append({
                "prediction_id": pred_id,
                "previous_state": state_info.get("previous_state", "START"),
                "current_state": state_info["state"],
                "counter": state_info["counter"]
            })
        else:
            # Fallback if state not found
            prediction_states.append({
                "prediction_id": pred_id,
                "previous_state": "START",
                "current_state": "START",
                "counter": 0
            })
    
    # Convert back to numpy array with proper dtype
    max_len = max(len(name) for name in modified)
    new_dtype = np.dtype(f'U{max_len}')
    modified_array = np.array(modified, dtype=new_dtype)
    
    keypoint_prediction.data['class_name'] = modified_array
    
    # Return result with state information for each prediction
    result = {
        "squat_prediction": keypoint_prediction,
    }
    
    return result
