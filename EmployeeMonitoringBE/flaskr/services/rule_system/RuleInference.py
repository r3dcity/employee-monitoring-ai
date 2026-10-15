import json
from datetime import datetime
from flaskr.entities.Alert import Alert, AlertType, AlertLevel, AlertStatus

class RuleInference:
    def __init__(self, rules=None):
        """
        Initializes the RuleInference engine.

        Args:
            rules (list[AlertRule], optional): A list of AlertRule objects. Defaults to None.
        """
        self.rules = []
        self.parsed_rules = []
        self.frame_context = {}
        self.last_triggered = {}  # Store when each rule was last triggered {rule_id: timestamp}
        if rules:
            self.load_rules(rules)

    def load_rules(self, rules):
        """
        Loads and parses rules from AlertRule objects.

        Args:
            rules (list[AlertRule]): A list of AlertRule objects.
        """
        self.rules = [rule for rule in rules if rule.is_active]
        self.parsed_rules = []
        for rule in self.rules:
            try:
                conditions_data = json.loads(rule.conditions_json)
                # Basic validation and normalization of structure
                if "conditions" in conditions_data:
                    # Handle both "logic" and "logical_operator" field names for backward compatibility
                    if "logic" in conditions_data and "logical_operator" not in conditions_data:
                        conditions_data["logical_operator"] = conditions_data["logic"]
                    elif "logical_operator" not in conditions_data:
                        # Default to AND if neither field is present
                        conditions_data["logical_operator"] = "AND"
                    
                    self.parsed_rules.append({
                        "rule_id": rule.id,
                        "priority": rule.priority, # Keep original Priority enum
                        "description": rule.description,
                        "conditions_data": conditions_data
                    })
                else:
                    print(f"Warning: Rule {rule.id} has invalid conditions_json structure (missing 'conditions'). Skipping.")
            except json.JSONDecodeError:
                print(f"Warning: Could not parse conditions_json for rule {rule.id}. Skipping.")
            except Exception as e:
                print(f"Warning: Error processing rule {rule.id}: {e}. Skipping.")
        print(f"Loaded {len(self.parsed_rules)} active and valid rules.")


    def set_frame_context(self, context):
        """
        Sets the context for the current frame to be evaluated.

        Args:
            context (dict): A dictionary containing information about the current frame,
                            e.g., timestamp, camera_id, detected_objects, dwell_times, etc.
        """
        self.frame_context = context

    def _evaluate_condition(self, condition):
        """Evaluates a single condition against the frame context."""
        condition_type = condition.get("type")
        operator = condition.get("operator")
        value = condition.get("value")
        print(f"Evaluating condition: {condition}")
        print(f"Frame context: {self.frame_context}")
        
        # --- Face Recognition Condition ---
        if condition_type == "face_recognition":
            # Get the list of employee IDs that should be recognized
            employee_ids = condition.get("employee_ids", [])
            # If employee_id is provided (legacy format), convert to list
            if "employee_id" in condition and not employee_ids:
                employee_ids = [condition.get("employee_id")]
                
            # Get the minimum dwell time in seconds
            dwell_time = condition.get("dwell_time", 0)
            
            # Check if any of the specified employees are detected
            detected_persons = self.frame_context.get("detected_persons", [])
            
            # If no specific employees listed, any recognized person counts
            if not employee_ids:
                return len(detected_persons) > 0
                
            # Otherwise, check if any of the specified employees are recognized
            for emp_id in employee_ids:
                if emp_id in detected_persons:
                    # If dwell time is specified, check it
                    if dwell_time > 0:
                        # Check if employee has been present for at least dwell_time seconds
                        face_dwell_times = self.frame_context.get("face_dwell_times", {})
                        if emp_id in face_dwell_times and face_dwell_times[emp_id] >= dwell_time:
                            return True
                    else:
                        # No dwell time required, employee presence is enough
                        return True
            print(f"Warning: No recognized employees found in frame context for rule condition: {condition}.")
            return False
            
        # --- Object Detected Condition ---
        elif condition_type == "object_detected":
            object_name = condition.get("object_name")
            count = condition.get("count", 1)  # Default to 1 if not specified
            operator = condition.get("operator", ">=")  # Default to >= if not specified
            dwell_time = condition.get("dwell_time", 0)
            
            if not object_name:
                return False
                
            # Get the count of objects of this type (case-insensitive)
            actual_count = 0
            for obj_name, obj_count in self.frame_context.get("detected_objects", {}).items():
                if obj_name.lower() == object_name.lower():
                    actual_count = obj_count
                    break
            
            # First check basic count condition
            if not self._compare(actual_count, operator, count):
                print(f"Object count check failed: {object_name.lower()} count is {actual_count}, needed {operator} {count}")
                return False
                
            # If dwell time specified, check that too
            if dwell_time > 0:
                # Find any object of this type that has been present for at least dwell_time
                for data in self.frame_context.get("dwell_times", {}).values():
                    if data.get("class_name", "").lower() == object_name.lower() and data.get("dwell_time", 0) >= dwell_time:
                        return True
                print(f"Warning: No {object_name} found with sufficient dwell time in frame context for rule condition: {condition}.")
                return False
            else:
                # No dwell time required, just count condition is enough
                return True

        # --- Object Count Condition ---
        elif condition_type == "object_count":
            object_name = condition.get("object_name")
            if not object_name or not operator or value is None: 
                print(f"Missing required parameter for object_count condition: object_name={object_name}, operator={operator}, value={value}")
                return False
            
            # Case-insensitive object count
            count = 0
            for obj_name, obj_count in self.frame_context.get("detected_objects", {}).items():
                if obj_name.lower() == object_name.lower():
                    count = obj_count
                    break
                    
            result = self._compare(count, operator, value)
            print(f"Object count condition for {object_name}: actual={count}, expected {operator} {value}, result={result}")
            return result

        # --- Dwell Time Condition ---
        elif condition_type == "dwell_time":
            object_name = condition.get("object_name")
            if not object_name or not operator or value is None: return False
            max_dwell = 0
            # Iterate through dwell_times dict {box_id: {"class_name": ..., "dwell_time": ...}}
            for data in self.frame_context.get("dwell_times", {}).values():
                if data.get("class_name", "").lower() == object_name.lower():
                    max_dwell = max(max_dwell, data.get("dwell_time", 0))
            return self._compare(max_dwell, operator, value)

        # --- PPE Missing Condition ---
        elif condition_type == "ppe_missing":
            ppe_type = condition.get("ppe_type") # e.g., "helmet", "vest", "mask"
            applies_to = condition.get("applies_to", "Person") # Usually applies to "Person"
            if not ppe_type: 
                print(f"Missing required ppe_type parameter for condition: {condition}")
                return False

            # Check if any person is missing the required PPE
            persons_present = self.frame_context.get("detected_persons", [])
            ppe_status = self.frame_context.get("ppe_status", {}) # {employee_id: {'helmet': True, ...}}
            
            print(f"PPE missing check for {ppe_type}. Persons present: {persons_present}")
            print(f"PPE status: {ppe_status}")
            
            # First check if the required object is detected
            object_counts = self.frame_context.get("detected_objects", {})
            person_count = object_counts.get("Person", 0)
            
            # Check if we're detecting the item that should have PPE
            if applies_to != "Person":
                detected_count = object_counts.get(applies_to, 0)
                if detected_count == 0:
                    print(f"No {applies_to} objects detected to check for PPE {ppe_type}")
                    return False
            elif person_count == 0:
                print(f"No persons detected to check for PPE {ppe_type}")
                return False
                
            # Check for the specific PPE items
            no_mask_count = object_counts.get("NO-Mask", 0)
            no_hardhat_count = object_counts.get("NO-Hardhat", 0)
            no_safety_vest_count = object_counts.get("NO-Safety Vest", 0)
            
            # Direct check for detection of PPE violations
            if ppe_type == "mask" and no_mask_count > 0:
                print(f"Detected {no_mask_count} person(s) without mask")
                return True
            elif ppe_type == "helmet" and no_hardhat_count > 0:
                print(f"Detected {no_hardhat_count} person(s) without helmet")
                return True
            elif ppe_type == "vest" and no_safety_vest_count > 0:
                print(f"Detected {no_safety_vest_count} person(s) without safety vest")
                return True
                
            # If we have recognized persons, check their PPE status
            if persons_present:
                for person_id in persons_present:
                    person_ppe = ppe_status.get(person_id, {})
                    if not person_ppe.get(ppe_type, False): # If PPE is missing (False or not present)
                        print(f"Person {person_id} is missing {ppe_type}")
                        return True # At least one person is missing the PPE
            print(f"No PPE violations found for {ppe_type}")
            return False # No person found missing the PPE

        # --- Zone Entry Condition ---
        elif condition_type == "zone_entry":
            zone_id = condition.get("zone_id")
            object_name = condition.get("object_name", "Person") # Default to Person if not specified
            if zone_id is None: return False

            zones_entered = self.frame_context.get("zones_entered", {}) # {employee_id: zone_id}
            detected_objects = self.frame_context.get("detected_objects", {})

            # Check if any specified object type entered the zone
            if object_name == "Person":
                for entered_zone in zones_entered.values():
                    if entered_zone == zone_id:
                        return True
            elif detected_objects.get(object_name, 0) > 0:
                # Simplistic: If the object type exists, assume it *could* be in the zone.
                # Needs refinement if specific object locations relative to zones are known.
                # For now, this might trigger if *any* object of the type is detected
                # and *any* person enters the zone (if zone_entered is only for persons).
                # A better approach needs object-specific zone information.
                print(f"Warning: Zone entry check for non-person object '{object_name}' is currently basic.")
                # Check if *any* person entered the target zone as a proxy for now
                for entered_zone in zones_entered.values():
                    if entered_zone == zone_id:
                        return True

            return False

        # --- Unauthorized Person Detected ---
        elif condition_type == "unauthorized_person":
             # Check if 'Person' is detected but not in recognized employees
             person_count = self.frame_context.get("detected_objects", {}).get("Person", 0)
             recognized_count = len(self.frame_context.get("detected_persons", []))
             # Simple check: more persons detected by YOLO than recognized by face rec
             # This is prone to errors if YOLO counts != face rec counts even for known people.
             # A better check might involve associating YOLO boxes with face rec results.
             if person_count > 0 and recognized_count == 0: # If persons detected but none recognized
                 return True
             # More advanced: Check if specific YOLO boxes lack associated recognized faces
             return False # Placeholder for more complex logic

        # --- Add more condition types as needed ---

        else:
            print(f"Warning: Unknown condition type '{condition_type}'.")
            return False

    def _compare(self, val1, operator, val2):
        """Compares two values based on the operator."""
        try:
            # Attempt type coercion if necessary (e.g., string numbers from JSON)
            v1 = type(val2)(val1) # Try converting val1 to type of val2
        except (ValueError, TypeError):
             v1 = val1 # Use original if conversion fails

        if operator == ">": return v1 > val2
        if operator == "<": return v1 < val2
        if operator == ">=": return v1 >= val2
        if operator == "<=": return v1 <= val2
        if operator == "==": return v1 == val2
        if operator == "!=": return v1 != val2
        # Add more operators like "in", "not in" if needed
        print(f"Warning: Unknown operator '{operator}'.")
        return False

    def _map_priority_to_level(self, priority):
        """Maps Priority enum (from rule) to AlertLevel enum."""
        # Assuming Priority enum has values 'LOW', 'MEDIUM', 'HIGH'
        # and AlertLevel enum has values 'low', 'medium', 'high'
        priority_str = str(priority.value).lower() # e.g., "low"
        try:
            return AlertLevel(priority_str)
        except ValueError:
            print(f"Warning: Could not map priority '{priority}' to AlertLevel. Defaulting to LOW.")
            return AlertLevel.LOW # Default level

    def _determine_alert_type(self, conditions):
        """Tries to determine a specific AlertType based on the triggering conditions."""
        # This is a heuristic and might need refinement based on rule complexity.
        # Prioritize more specific conditions.
        has_ppe_missing = any(c.get("type") == "ppe_missing" for c in conditions)
        has_unauthorized = any(c.get("type") == "unauthorized_person" for c in conditions)
        has_object_count = any(c.get("type") == "object_count" for c in conditions)

        if has_ppe_missing:
            ppe_type = next((c.get("ppe_type") for c in conditions if c.get("type") == "ppe_missing"), None)
            if ppe_type == "helmet": return AlertType.NO_HELMET_DETECTED
            if ppe_type == "mask": return AlertType.NO_MASK_DETECTED
            if ppe_type == "vest": return AlertType.NO_VEST_DETECTED
            if ppe_type == "gloves": return AlertType.NO_GLOVES_DETECTED # Added
            # Fallback if PPE type is unknown
            return AlertType.PERSON_DETECTED # Or a generic PPE alert type

        if has_unauthorized:
            return AlertType.UNAUTHORIZED_PERSON_DETECTED

        # Could add more specific types based on zone entry, dwell time + object type etc.

        # Fallback based on object count if other specific conditions aren't met
        if has_object_count:
             object_name = next((c.get("object_name") for c in conditions if c.get("type") == "object_count"), None)
             if object_name == "Person":
                 # If only person count triggered it, could be simple detection
                 return AlertType.PERSON_DETECTED
             # Could map other object names to specific alert types if needed

        # Generic fallback
        print("Warning: Could not determine specific alert type from conditions. Using PERSON_DETECTED as fallback.")
        return AlertType.PERSON_DETECTED


    def infer(self, frame_context = None):
        """
        Evaluates all loaded rules against the current frame context and generates alerts.

        Returns:
            list[Alert]: A list of Alert objects for rules whose conditions were met.
        """
        triggered_alerts = []
        self.frame_context = frame_context if frame_context is not None else self.frame_context
        if not self.frame_context:
            print("Warning: Frame context not set. Cannot perform inference.")
            return triggered_alerts

        timestamp = self.frame_context.get("timestamp", datetime.now())
        camera_id = self.frame_context.get("camera_id")
        current_time = datetime.now()
        
        #print(f"Starting inference with {len(self.parsed_rules)} rules for camera {camera_id}")
       # print(f"Frame context summary: Objects detected: {self.frame_context.get('detected_objects', {})}")

        for parsed_rule in self.parsed_rules:
            rule_id = parsed_rule["rule_id"]
            
            # Check if rule is on cooldown
            if rule_id in self.last_triggered:
                # Get the rule from original rules list to access cooldown_seconds
                rule = next((r for r in self.rules if r.id == rule_id), None)
                if rule and rule.cooldown_seconds > 0:
                    time_since_last_alert = (current_time - self.last_triggered[rule_id]).total_seconds()
                    if time_since_last_alert < rule.cooldown_seconds:
                        print(f"Rule {rule_id} is on cooldown. {rule.cooldown_seconds - time_since_last_alert:.1f} seconds remaining.")
                        continue
            
            conditions = parsed_rule["conditions_data"]["conditions"]
            logical_op = parsed_rule["conditions_data"]["logical_operator"].upper() # AND or OR
            
           # print(f"Evaluating rule {rule_id}: {parsed_rule['description']}")
            #print(f"Logical operator: {logical_op}")

            results = [self._evaluate_condition(cond) for cond in conditions]
            
            #print(f"Condition results: {results}")

            rule_triggered = False
            if logical_op == "AND":
                rule_triggered = all(results)
            elif logical_op == "OR":
                rule_triggered = any(results)
            else:
                 print(f"Warning: Unknown logical operator '{logical_op}' for rule {rule_id}. Defaulting to AND.")
                 rule_triggered = all(results)

            print(f"Rule {rule_id} triggered: {rule_triggered}")

            if rule_triggered:
                # Update the last triggered time for this rule
                self.last_triggered[rule_id] = current_time
                
                # --- Create Alert Object ---
                alert_level = self._map_priority_to_level(parsed_rule["priority"])
                alert_type = self._determine_alert_type(conditions) # Determine type based on conditions
                explanation = parsed_rule["description"] or f"Rule {rule_id} triggered."

                # Try to find relevant employee/zone IDs from context if applicable
                employee_id = None
                zone_id = None
                # Example: If triggered by PPE missing or zone entry, find the person involved
                if alert_type in [AlertType.NO_HELMET_DETECTED, AlertType.NO_MASK_DETECTED, AlertType.NO_VEST_DETECTED, AlertType.UNAUTHORIZED_PERSON_DETECTED]:
                     # Find the first person ID from the context (simplistic)
                     employee_id = next(iter(self.frame_context.get("detected_persons", [])), None)
                     # If unauthorized, maybe don't set employee_id? Or set a specific flag?
                     if alert_type == AlertType.UNAUTHORIZED_PERSON_DETECTED:
                         employee_id = None # Don't link to a specific employee

                zone_condition = next((c for c in conditions if c.get("type") == "zone_entry"), None)
                if zone_condition:
                    zone_id = zone_condition.get("zone_id")
                    # If triggered by zone entry, find the person who entered (if applicable)
                    if employee_id is None and "Person" in zone_condition.get("object_name", "Person"):
                         zones_entered = self.frame_context.get("zones_entered", {}) # {employee_id: zone_id}
                         for emp_id, entered_zone in zones_entered.items():
                             if entered_zone == zone_id:
                                 employee_id = emp_id
                                 break

                alert = Alert(
                    type=alert_type,
                    level=alert_level,
                    timestamp=timestamp,
                    status=AlertStatus.ACTIVE,
                    explanation=explanation,
                    camera_id=camera_id,
                    employee_id=employee_id, # May be None
                    zone_id=zone_id,         # May be None
                    alert_rule_id=rule_id # Link alert to the rule
                )
                triggered_alerts.append(alert)
                # -------------------------

        return triggered_alerts
